var cluster = require('cluster');
var EventEmitter = require('events').EventEmitter;
var cpuCount = require('os').cpus().length;
const cache = require('microgateway-plugins').memored;

const PURGE_INTERVAL = 60000;

/**
 * Creates a Wrapper around node Cluster module. Gives ability to reload the cluster gracefully
 * @param file                    {String} path to the server file
 * @param opt                     {Object} options
 * @param opt.timeout             {Number} kill timeout for old workers to be killed after reload (seconds)
 * @param opt.workers             {Number} number of workers to be spawned. Defaults to no. of cores
 * @param opt.minRespawnInterval  {Number} min time between respawns when workers die (seconds)
 * @param opt.workerReadyWhen     {String} when does the worker become ready? 'listening' or 'started'. default is 'listening'
 * @param opt.args                {Array} arguments to pass to the worker (default: [])
 * @param opt.log                 {Object} what to log to stdout (default: {respawns: true})
 * @param opt.logger              {Function} logger to use, needs `log` method (default: console)
 * @return - the ReloadCluster. To run, use .run() and to reload, .reload()
 */

var ReloadCluster = (file, opt) => {

  // initializing opt with defaults if not provided
  opt = opt || {};
  opt.workers = opt.workers || cpuCount;
  opt.timeout = opt.timeout || 30; // default timeout for reload is set as 30 sec
  opt.workerReadyWhen = opt.workerReadyWhen || 'listening';
  opt.args = opt.args || [];
  opt.log = opt.log || {respawns: true};
  opt.respawnIntervalManager = RespawnIntervalManager({minRespawnInterval: opt.minRespawnInterval});

  var respawnerTimers = RespawnTimerList();
  var readyEvent = opt.workerReadyWhen == 'started' ? 'online' : opt.workerReadyWhen == 'listening' ? 'listening' : 'message';
  var readyCommand = 'ready';
  var self = new EventEmitter();
  var channel = new EventEmitter();
  var workers = [];
  var activeWorkers = {length: opt.workers};

  /**
   * removes worker from activeWorkers array
   * @param w - worker
   */
  function removeWorkerFromActiveWorkers(w) {
    if (activeWorkers[w._rc_wid] == w) {
      activeWorkers[w._rc_wid] = null;
    }
  }

  /**
   * emits events on the channel and propogates the event to self.
   * This will make sure for anyone who is listening on an event on
   * reload-cluster instance, the event will be emitted for any underlying events.
   */
  function emit() {
    channel.emit.apply(self, arguments);
    self.emit.apply(channel, arguments);
  }


  /**
   * Fork a new worker. Give it a reloadCluster ID and
   * also redirect all its messages to the cluster.
   * @param wid
   * @returns worker object
   */
  function fork(wid) {
    var w = cluster.fork({WORKER_ID: wid});
    w._rc_wid = wid;
    w._rc_isReplaced = false;
    // whenever worker sends a message, emit it to the channels
    w.on('message', (message) => {
      opt.logger.writeLogRecord(message);
      emit('message', w, message);
    });
    // When a worker exits remove the worker reference from workers array, which holds all the workers
    w.process.on('exit', () => {
      removeItem(workers, w);
      removeWorkerFromActiveWorkers(w);
    });
    // push the forked worker to the workers array which holds all the workers
    workers.push(w);
    return w;
  }

  /**
   * Replace a dysfunctional worker
   * @param worker
   */
  function replaceWorker(worker) {
    if (worker._rc_isReplaced) return;
    worker._rc_isReplaced = true;

    removeWorkerFromActiveWorkers(worker);

    // respawn worker
    try {
        var interval = opt.respawnIntervalManager.getIntervalForNextSpawn(Date.now());
        if (opt.log.respawns) {
          opt.logger.info('[' + worker.process.pid + '] worker (' + worker._rc_wid  + ':' + worker.id + ') must be replaced, respawning in', interval);
        }
    
        var respawnerTimer = setTimeout(() => {
          respawnerTimers.remove(respawnerTimer);
          fork(worker._rc_wid);
        }, interval);
    
        respawnerTimers.add(respawnerTimer);
    } catch (e) {
      console.warn(e);
    }
  }

  /**
   * Replace a worker that has closed the IPC channel
   * or signaled that its dysfunctional. Will also
   * terminate the worker after the specified time has passed.
   *
   * @param w - worker
   */
  function replaceAndTerminateWorker(w) {
    replaceWorker(w);
    disconnectAndShutdownWorker(w);
  }

  /**
   * Sets up a kill timeout for a worker. Closes the
   * IPC channel immediately.
   * @param worker
   */
  function disconnectAndShutdownWorker(worker) {
    function forceKillWorker() {
      try {
        if (worker.kill) {
          worker.kill();
        } else {
          worker.destroy();
        }
      } catch (e) {
      }
    }

    if (opt.timeout > 0) {
      var timeout = setTimeout(forceKillWorker, opt.timeout * 1000);
      worker.once('exit', clearTimeout.bind(this, timeout));
      // possibly a leftover worker that has no channel
      // estabilished will throw error. Ignore.
      try {
        //test if the worker exists
        if (worker.isConnected()) {
          worker.send({cmd: 'disconnect'});
          worker.disconnect();  
        }
      } catch (e) {
        console.warn(e);
      }
    } else {
      process.nextTick(forceKillWorker);
    }

    removeWorkerFromActiveWorkers(worker);
  }


  function emitWorkerListening(w, adr) {
    emit('listening', w, adr);
  }

  function emitWorkerOnline(w) {
    emit('online', w);
  }

  function emitWorkerDisconnect(w) {
    emit('disconnect', w);
  }

  function emitWorkerExit(w) {
    emit('exit', w);
  }

  // setting maxListeners to avoid leaks
  channel.setMaxListeners(opt.workers * 4 + 10);

  /**
   * Method to run the cluster
   */
  self.run = () => {
    if (!cluster.isMaster) return;
    //setup memored - a cache shared between worker processes. intro in 2.5.9
    cache.setup({
        purgeInterval: PURGE_INTERVAL
    });
    cluster.setupMaster({exec: file});
    cluster.settings.args = opt.args;

    const argv = cluster.settings ? cluster.settings.execArgv || [] : [];
    var j = 0;
    if ( argv ) {
      argv.forEach((arg) => {
        if (arg.includes('--debug-brk=')) {
          argv[j] = arg.replace('--debug-brk', '--debug')
        }
        j++;
      });
    }

    // fork workers
    for (var i = 0; i < opt.workers; i++) {
      fork(i);
    }
    // Event handlers on the cluster
    // This exit event happens, whenever a worker exits.
    cluster.on('exit', emitWorkerExit);
    // This event is emitted when a worker IPC channel has disconnected
    cluster.on('disconnect', emitWorkerDisconnect);
    // Whenever a server.listen() is called in the worker, this event is emitted.
    cluster.on('listening', emitWorkerListening);
    // Whenever a worker goes online, this event is emitted.
    cluster.on('online', emitWorkerOnline);

    // Event handlers on the channel
    channel.on(readyEvent, (w, arg) => {
      // ignore unrelated messages when readyEvent = message
      if ( (readyEvent === 'message') && ( !arg || arg.cmd != readyCommand ) ) return;
      emit('ready', w, arg);
    });
    // When a worker exits, try to replace it
    channel.on('exit', replaceWorker);
    // When it closes the IPC channel or signals that it can no longer
    // do any processing, replace it and then set up a termination timeout
    channel.on('disconnect', replaceAndTerminateWorker);
    channel.on('message', (w, arg) => {
      if ( arg && arg.cmd === 'disconnect' ) {
        replaceAndTerminateWorker(w);
      }
    });
    // When a worker becomes ready, add it to the active list
    channel.on('ready', (w) => {
      activeWorkers[w._rc_wid] = w;
    })

  };

  /**
   * Method to reload the cluster
   */
  self.reload = function (cb) {
    if (!cluster.isMaster) return;
    //clear the cache before terminating the process
    cache.clean(function(){});
    respawnerTimers.clear();

    function allReady(cb) {
      var listenCount = opt.workers;
      var self = this;
      return (w, arg) => {
        if (!--listenCount) cb.apply(self, arguments);
      };
    }

    workers.forEach((worker) => {
      var id = worker.id;

      var stopOld = allReady(() => {
        // dont respawn this worker. It has already been replaced.
        worker._rc_isReplaced = true;

        // Kill the worker after the appropriate timeout has passed
        disconnectAndShutdownWorker(worker);
        channel.removeListener('ready', stopOld);
      });

      channel.on('ready', stopOld);
    });

    if (cb) {
      var allReadyCb = allReady(() => {
        channel.removeListener('ready', allReadyCb);
        cb();
      });
      channel.on('ready', allReadyCb);
    }
    for (var i = 0; i < opt.workers; ++i) fork(i);
  };

  /**
   * Method to terminate the cluster
   */
  self.terminate = (cb) => {
    self.stop();
    cluster.on('exit', allDone);
    workers.forEach((worker) => {
      if (worker.kill)
        worker.kill('SIGKILL');
      else
        worker.destroy();
    });
    allDone();
    function allDone() {
      var active = Object.keys(cluster.workers).length;
      if (active === 0) {
        cluster.removeListener('exit', allDone);
        if ( cb ) cb();
      }
    }
  };

  /**
   * Method to stop the cluster
   */
  self.stop = () => {
    if (!cluster.isMaster) return;
    cluster.removeListener('exit', emitWorkerExit);
    cluster.removeListener('disconnect', emitWorkerDisconnect);
    cluster.removeListener('listening', emitWorkerListening);
    cluster.removeListener('online', emitWorkerOnline);
    respawnerTimers.clear();

    channel.removeAllListeners();
  };

  self.workers = () => {
    return workers;
  };

  self.activeWorkers = () => {
    return activeWorkers;
  };

  return self;
};

module.exports = ReloadCluster;

/**
 *
 * @param opt
 * @returns {RespawnIntervalManager}
 * @constructor
 */
function RespawnIntervalManager(opt) {

  var respawnInterval = opt.minRespawnInterval || 1;  // default to 1 sec
  var lastSpawn = Date.now();

  this.getIntervalForNextSpawn = function (now) {
    var nextSpawn = Math.max(now, lastSpawn + respawnInterval * 1000),
      intervalForNextSpawn = nextSpawn - now;
    lastSpawn = nextSpawn;

    return intervalForNextSpawn;
  }

  return this;
}

/**
 * Decorator for holding respawn timers
 *
 * @constructor
 */
function RespawnTimerList() {
  var items = [];
  var self = {};
  self.clear = () => {
    items.forEach((item) => {
      clearTimeout(item);
    });
    items = [];
  };
  self.add = (t) => {
    items.push(t);
  };
  self.remove = (t) => {
    items.splice(items.indexOf(t), 1);
  };
  return self;
}

/**
 * removes an item from the array
 * @param arr
 * @param item
 */
function removeItem(arr, item) {
  var index = arr.indexOf(item);
  if (index >= 0) arr.splice(index, 1)
}

// Idea and Implementations are inspired from the following repositories
// https://github.com/andrewrk/naught under MIT license
// https://github.com/doxout/recluster under MIT license
