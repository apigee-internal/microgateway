'use strict'

var cluster = require('cluster');
var EventEmitter = require('events').EventEmitter;
var cpuCount = require('os').cpus().length;
const cache = require('microgateway-plugins').memored;

const PURGE_INTERVAL = 60000;
//
const DEFAULT_PROCESS_CHECK_INTERVAL = 10000
const DEFAULT_EXIT_COUNT_INTERVAL = 1000  // 5000
const RAPID_REPLAY_INTERVAL_STOPPED_PROCESSES = 50
const CALLBACK_TIMEOUT = 5000
const MAX_CONNECT_FAIL_TIME = 200

const MAX_PERIODS_EXIT_RATE = 5

//
var RLC = null;  // an instance if needed
var gCurrentExitCount = 0  // available to the RLC, etc.

class ExitCounter {

  // --
  constructor(theta,targetCB,interval) {
    this.periods = []
    this.exitsPerPeriod = 0
    this.threshold = theta
    this.checkRate = (interval !== undefined)? interval : DEFAULT_EXIT_COUNT_INTERVAL
    gCurrentExitCount = 0

    this.checkInterval = setInterval(() => {
      var b = this.calcExitRate()
      if ( targetCB ) {
        targetCB(b)
      }
    },this.checkRate)
  }

  // --
  add(count) {
    this.periods.push(count)
  }

  //--
  averageRate() {
    var init = 0
    if ( this.periods.length > MAX_PERIODS_EXIT_RATE) {
      init = this.periods.shift()
    }
    var n = this.periods.length;
    if ( n === 0 ) {
      return 0
    }
    var sum = init
    for ( var i = 0; i < n; i++ ) {
      sum += this.periods[i]
    }
    var avg = sum/n

    return avg
  }

  // --
  calcExitRate() {
    var prevExitCount = gCurrentExitCount;
    gCurrentExitCount = 0;
    this.add(prevExitCount)
    if ( this.averageRate() > this.theta ) {
      console.log("EXPERIENCING HIGH RATE OF PROCESS EXITS")
      return(false)
    }
    return(true)
  }

  // --
  stop() {
    clearInterval(this.checkInterval)
  }

}

var gExitCounter = null


/*
class RespawnIntervalManager {
  //
  constructor(opt) {
    if ( opt ) {
      this.respawnInterval = (opt.minRespawnInterval !== undefined) && (opt.minRespawnInterval >= 0) ? opt.minRespawnInterval : 1;  // default to 1 sec
    } else {
      this.minRespawnInterval = 1
    }
    this.lastSpawn = Date.now();
  }
  //
  getIntervalForNextSpawn(now) {
    var nextSpawn = Math.max(now, (this.lastSpawn + (this.respawnInterval * 1000)))
    var intervalForNextSpawn = nextSpawn - now;
    this.lastSpawn = nextSpawn;
    return intervalForNextSpawn;
 }

 getNextSpawnFromNow() {
   return(this.getIntervalForNextSpawn(Date.now()))
 }

}
*/

var gRespawnIntervalManager = false; //new RespawnIntervalManager();

/**
 * TimerList class
 * Maintain a list of timers identified by their timer object, returned but setTimout
 * Include convenience methods for adding, removing, and updating timers.
 */
class TimerList {
  //
  constructor() {
    this.items = []
  }
  //
  clear() {
    this.items.forEach((item) => {
      clearTimeout(item);
    })
    this.items = []
  }
  //
  add(id) {
    if ( this.items ) {
      this.items.push(id)
    }
  }
  //
  addTimeout(cb,tlapse) {
    var to = setTimeout(cb,tlapse)
    this.add(to)
    return(to)
  }

  replaceTimeout(id,cb,tlapse) {
    this.remove(id)
    this.addTimeout(cb,tlapse)
  }
  //
  remove(id) {
    if ( (id !== undefined) && (id !== null) ) {
      clearTimeout(id);
      if ( this.items ) {
        this.items.splice(this.items.indexOf(id),1)
      }
    }
    return undefined
  }
  //
}


//  CallbackList class
//  Add and remove callbacks. 
//  One method for calling all callbacks
//  This is useful in maintaining that should be called when a condition is met,
//  but all execution pathways to the condition cannot gaurantee a stack variable 
//  to be available for a single callback.
class CallbackList {
  constructor() {
    this.items = []
  }
  //
  clear() {
    this.items = []
  }
  //
  add(cb) {
    if ( this.items && (typeof cb === 'function' ) ) {
      if ( this.items.indexOf(cb) < 0 ) {
        this.items.push(cb)
      }
    }
  }
  //
  remove(cb) {
    if ( typeof cb === 'function' ) {
      this.items.splice(this.items.indexOf(cb),1)
    }
  }

  runCallBacks() {
    if ( this.items && (this.items.length > 0) ) {
      this.items.forEach( cb => {
        try {
          cb()
        } catch (e) {
          console.log(e)
        }
      })  // when done eliminate
      this.items = []
    }
  }
}




class WorkerInfo {
  //
  constructor(worker) {
    this.request_disconnect = false
    this.request_shutdown = false
    this.connectedEvent = worker.isConnected()
    this.ready = false
    this.trackingStartTime = Date.now()
    this.worker_key = worker.id
    this.address = ''
  }
  // --connectTimeout--------------------------------------- 
  // Check if more time has gone by for connecting than we can tolerate 
  connectTimeout() {
    var worker = cluster.workers[this.worker_key]
    if ( worker !== undefined ) {
      if ( !(worker.isConnected()) ) {
        var onset = this.trackingStartTime
        var diff = Date.now() - onset
        //
        //if ( diff > MAX_CONNECT_FAIL_TIME  )  console.log(`DISCONNECT TIMEOUT ${this.worker_key}`)
        //
        return ( diff > MAX_CONNECT_FAIL_TIME ) 
      }
    } else {
      return true
    }
    return false
  }
  //
}


// GLOBAL
// ---- ---- ---- ---- ---- ---- ----
var gExtantTimers = new TimerList();
var gStoppedProcCallbacks = new CallbackList();

// keeping these as global variables.
var tClosers = {}
var tTracked = {}
// ---- ---- ---- ---- ---- ---- ----


// --shouldTrackWorker--------------------------------------- 
// Decide if a worker should be put into or kept in the tracking map.
function shouldTrackWorker(w,isTracked) {
  if ( w === undefined ) return(false)
  var w_info = tTracked[w.id]
  var alreadyTracked = (w_info !== undefined) 
  var wrongTrackingState = isTracked ? !alreadyTracked : alreadyTracked
  var itsDead = w.isDead()
  var itLostConnection = isTracked && !(w.isConnected() && (w_info && w_info.connectedEvent))
  var itTimedoutWaitingForConnection = isTracked && (w_info && w_info.connectTimeout())
  var itsInClosers = tClosers.hasOwnProperty(w.id)
  //
  var somethingsWrong = (wrongTrackingState || itsDead || itLostConnection || itTimedoutWaitingForConnection || itsInClosers)
  //
  return(!somethingsWrong)
}


// --cleanUpTrackedProcess--------------------------------------- 
// look through the tracked processes to see if anyone has died or disconnected
// called by consonantProcesses
function cleanUpTrackedProcess() {  // walk through tracked processes
  var cw_map = cluster.workers;
  for ( var wk in tTracked ) {    // remove any processes that are dead and make room for new ones
    var worker = cw_map[wk]  // processes are in tTracked immedately after a fork and retain space until they fail
    if ( worker === undefined ) {  // process is gone 
      delete tTracked[wk]  // stop tracking this process // and put it nowhere... it is gone (delete tracking info)
    } else if ( !shouldTrackWorker(worker,true) ) {
      // moved tracking info
      tClosers[wk] = tTracked[wk] // this should never overwrite ... but it could be checkd. Decided not to.
      delete tTracked[wk]  // stop tracking this process
    }
  }
}


// --untrackTrackedProcesses--------------------------------------- 
// During reloading or other terminating, there may be a need to stop all tracked processes.
// This does not look at the cluster process list or check the processes in tTracked for health.
// It just moves processes to the closers list and removes them form the tracked list.
function untrackTrackedProcesses() {  // clear out tracked processes and put them in the die off list.
  //
  for ( var wk in tTracked ) {    // remove any processes that are dead and make room for new ones
    tClosers[wk] = tTracked[wk]  // this should never overwrite ... but it could be checkd. Decided not to.
    delete tTracked[wk]
  }
  //
}



// --clearOutStoppedProcesses--------------------------------------- 
// --closePreconditions--------------------------------------- 

// --closePreconditions--------------------------------------- 
// TBD any reason that cleaning out stopped processs should proceed or not
function closePreconditions() {
  return(true)
}


function requestShutdownNow(w,w_info) {
  if ( w_info !== undefined ) {
    w_info.request_shutdown = true
  }
  if ( w !== undefined ) {
    w.kill('SIGKILL')
  }
}


function cullProcesses() {
  for ( var wk in tClosers ) {  // Look through the list of closed processes by key
    var w = cluster.workers[wk]   // always get the current representation from the cluster (this object changes)
    if ( w === undefined ) {
      delete tClosers[wk]   // this process is now history
    } else {
      var w_info = tClosers[wk]
      //
      if ( !(w.isDead()) && w.isConnected() ) {     // If the processes is still live .. first disconnect it
        try {
          w.disconnect()  // from the IPC 
          w_info.request_disconnect = true
        } catch (e) {
          // might have never connected
          //console.log(e)
        }
      } else if ( !(w.isDead()) && !(w.isConnected()) ) {   // The processes is no longer connected ... so kill it
        requestShutdownNow(w,w_info)
      } else if ( w.isDead() ) {    // This process is finally done (might get second opinion from OS)
        delete tClosers[wk]         // remove it
      }
   }
  }
}

// --clearOutStoppedProcesses--------------------------------------- 
// Actively search for processes to dispense with. Try to stop any that are hanging around
var gExtantTimerForStoppedProcess = null
function clearOutStoppedProcesses(cb,threshold) {
  if ( threshold === undefined ) {
    threshold = 0
  }
  if ( gExtantTimerForStoppedProcess !== null ) {
    gExtantTimers.remove(gExtantTimerForStoppedProcess)
    gExtantTimerForStoppedProcess = null
  }
  if ( cb ) {
    gStoppedProcCallbacks.add(cb)
  }
  //
  if ( closePreconditions() ) {
    //
    cullProcesses()
    //
    //  Depending on wheather there is more work to do wait and look again for change of state.
    //  Otherwise, healthcheck is on an interval defined by the application and it will look there. 
    if ( Object.keys(tClosers).length > threshold  ) {
      gExtantTimerForStoppedProcess = gExtantTimers.addTimeout(() => { clearOutStoppedProcesses(cb,threshold) },RAPID_REPLAY_INTERVAL_STOPPED_PROCESSES)
    } else {
      gStoppedProcCallbacks.runCallBacks()
    }
    //
  } else {  // delay until preconditions clear e.g. waiting for some process to start
    gExtantTimerForStoppedProcess = gExtantTimers.addTimeout(() => { clearOutStoppedProcesses(cb) },RAPID_REPLAY_INTERVAL_STOPPED_PROCESSES)
  }
}



function workersFullHouse(rlc) {
  var wantsmore = rlc.consonantProcesses();
  var clearoutCount = Object.keys(tClosers).length
  if ( clearoutCount > rlc.numWorkers ) {
    clearOutStoppedProcesses(() => {
      workersFullHouse(rlc)
    },rlc.numWorker)
  } else {
    if ( gRespawnIntervalManager && (wantsmore > 0) ) {
      var intrval = gRespawnIntervalManager.getNextSpawnFromNow()
      var iNextSpawn = gExtantTimers.addTimeout(() => { 
        rlc.requestNewWorker();
        gExtantTimers.remove(iNextSpawn)
        workersFullHouse(rlc)
      },intrval)
    } else {
      while ( wantsmore ) {
        //console.log(wantsmore)
        rlc.requestNewWorker()
        wantsmore--;
      }  
    }
  }
}



// --healthCheck--------------------------------------- 
// Checks for processes that might be running and shouldn't be. And, will attempt to eliminate them.
// Checks for processes that should be running and requests them. 
// This should be set on an interval by the ClusterManager and works as a watchdog on processes in case events handlers fail to work
function healthCheck(rlc,special) {
  if ( rlc ) {
    if ( rlc.reloading && !special ) return;
    clearOutStoppedProcesses()
    workersFullHouse(rlc)
  }
}



const readyCommand = 'ready';

class ClusterManager extends EventEmitter {

  //
  constructor(file,opt) {
    super()
    //
    this.opt = {}
    this.numWorkers = opt.workers
    this.optionDefaults(opt)
    //
    this.readyEvent = 'online'
    this.reloading = false
    this.callbackTO = null  // callback timeout
    this.shuttingdown = false 
    this.mayReload = true
    //
    //this.readyEvent = opt.workerReadyWhen === 'started' ? 'online' : opt.workerReadyWhen === 'listening' ? 'listening' : 'message';
    // // //
    this.initializeCache()
    this.setupClusterProcs(file)
    this.setUpClusterHandlers()
    // 
    gExitCounter = new ExitCounter(2*this.numWorkers,(b) => {
      this.mayReload = b;
    });
    this.healthCheckInterval = setInterval(() => {
      healthCheck(this) 
    },DEFAULT_PROCESS_CHECK_INTERVAL)  // once in a while check to see if everything is the way it is supposed to be
  }
  
  // --optionDefaults--------------------------------------- 
  optionDefaults(opt) {
    // initializing opt with defaults if not provided
    this.numWorkers = this.numWorkers || cpuCount;
    this.opt.timeout = opt.timeout || 30; // default timeout for reload is set as 30 sec
    this.opt.workerReadyWhen = opt.workerReadyWhen || 'listening';
    this.opt.args = opt.args || [];
    this.opt.log = opt.log || {respawns: true};
    //gRespawnIntervalManager = new RespawnIntervalManager({minRespawnInterval: opt.minRespawnInterval});
  }

  // --initializeCache--------------------------------------- 
  initializeCache() {
    //setup memored - a cache shared between worker processes. intro in 2.5.9
    cache.setup({
      purgeInterval: PURGE_INTERVAL
    });
  }
  
  // --setupClusterProcs--------------------------------------- 
  setupClusterProcs(file) {
    cluster.setupMaster({exec: file});
    cluster.settings.args = this.opt.args;
    //
    const argv = cluster.settings ? cluster.settings.execArgv || [] : [];
    if ( argv ) {
      argv.forEach((arg,j) => {
        if (arg.includes('--inspect-brk')) {
          argv[j] = arg.replace('--inspect-brk', '--inspect')
        }
      });
    }
    //
  }

  // --setUpClusterHandlers--------------------------------------- 
  setUpClusterHandlers() {
    // Event handlers on the cluster
    // This exit event happens, whenever a worker exits.

    this.handleWorkerExit = (w) => {
      console.log(`handleWorkerExit ${w.id}`)
      this.workerExit(w)
    }

    this.handleWorkerDisconnect = (w) => {
      console.log(`emitWorkerDisconnect ${w.id}`)
      this.workerDisconnect(w)
    }

    this.handleWorkerListening = (w, adr) => {
      console.log(`handleWorkerListening ${w.id}`)
      this.workerConnect(w,adr)
      if ( this.readyEvent === 'listening' ) {
        this.handleReadyEvent(w)
      }
    }
  
    this.handleWorkerOnline = (w) => {
      console.log(`worker ${w.id} is online ...`)
      this.workerConnect(w)
      if ( this.readyEvent === 'online' ) {
        this.handleReadyEvent(w)
      }
    }
  
    //
    cluster.on('exit', this.handleWorkerExit );
    // This event is emitted when a worker IPC channel has disconnected
    cluster.on('disconnect', this.handleWorkerDisconnect );
    // Whenever a server.listen() is called in the worker, this event is emitted.
    cluster.on('listening', this.handleWorkerListening );
    // Whenever a worker goes online, this event is emitted.
    cluster.on('online', this.handleWorkerOnline);
    //
    cluster.on('message',(w, arg) => {
      if ( this.readyEvent === 'message' && (!arg || ( arg && arg.cmd === readyCommand ) )) {
        this.handleReadyEvent(w)
      } else if ( arg && arg.cmd === 'disconnect' ) {
        this.handleWorkerDisconnect(w)
      }
    })

  }

  // --workerConnect---------------------------------------
  // Sets a state indicating that the worker has connected.
  // depending on the path to this. a network address may be available. 
  workerConnect(w,adr) {
    var wk = w.id
    var worker = cluster.workers[wk]
    if ( worker !== undefined ) {
      if ( tTracked.hasOwnProperty(wk) ) {
        var w_info = tTracked[wk]
        w_info.connectedEvent = true
        w_info.address = adr ? adr : ''
      }
    }
  }


  // --workerExit---------------------------------------
  // Cleanup tracked processes, which should attempt to put the worker into the closer list if it is still active
  workerExit(w) {
    gCurrentExitCount++ // leaving it like this for now
    cleanUpTrackedProcess()
    var w_info = tClosers[w.id] // the process should be here now if it is not undefined
    if ( w_info !== undefined ) {
      if ( w_info.request_disconnect || w_info.request_shutdown ) { // if we are removing this processes keep removing it
        setImmediate(clearOutStoppedProcesses) // this should have been done, but keep pushing on it
      } else {  // this is a process we lost and did not attempt to remove
        process.nextTick(() => { workersFullHouse(this) })
      }
    } else {
      setImmediate(() => { healthCheck(this) })  // make sure that there are enough processes and that we are not keeping zombies around
    }
  }
  
  workerDisconnect(w) {
    var w_info = tClosers[w.id] // the process should be here now if it is not undefined
    if ( (w_info === undefined) || w_info.request_disconnect ) {
      requestShutdownNow(w,w_info)
      clearOutStoppedProcesses() // this should have been done, but keep pushing on it
    } else {
      requestShutdownNow(w,w_info)
      setImmediate(() => { healthCheck(this) })
    }
  }

  // --callReloadCallback--------------------------------------- 
  // This is called when there are enough processes being tracked or
  // when enough time has gone by that the client deserves a response
  finallyReloadCallback() {
    this.callabackTO = gExtantTimers.remove(this.callabackTO)
    if ( this.readyCb !== undefined ) {
      this.readyCb();
    }
    this.readyCb = undefined
  }

  // --beginProcessStabilization--------------------------------------- 
  beginProcessStabilization() {
    setImmediate(() => {  // at the next chance clear out processes being stopped.
      clearOutStoppedProcesses(() => { 
        this.reloading = false; 
      })
    })
  }

  // --manageReloadCallBack--------------------------------------- 
  manageReloadCallBack(cb) {
    this.callbackTO = gExtantTimers.replaceTimeout(this.callbackTO,cb,CALLBACK_TIMEOUT)
  }

  // --handleReloadReadyEvents--------------------------------------- 
  handleReloadReadyEvents(/*w*/) {
    if ( this.readyCb ) {
      //
      var wantMore = this.consonantProcesses()  // returns the number of processes missing (and moves unusable processes to tClosers)
      //
      if ( !wantMore ) {
        this.finallyReloadCallback()
        this.beginProcessStabilization()
      } else { // Put out checkup out there to see if more is still wanted
        //
        this.manageReloadCallBack(() => {
          // getting enough processes took too long. So, this is finally called and not removed. 
          // So, call the callback and leave it up to the health cneck to get things back on track
          this.finallyReloadCallback()
          this.beginProcessStabilization()
        })
        //
      }
    }
  }

  // --handleReadyEvent--------------------------------------- 
  // Set the process state for ready when it achieves the applications 
  // definition of readiness
  handleReadyEvent(w) {
    if ( this.reloading ) {
      this.handleReloadReadyEvents(w)
    }
  }

  // -------------------------------------------------------
  // -------------------------------------------------------

  
  // --stopExtantTimers----------------------------------------------------
  // pass to the tkmer manager instance
  stopExtantTimers() {
    gExtantTimers.clear()
  }

  // --stopExtantTimers----------------------------------------------------
  // Request new workers as many times as set by the application
  forkWorkers() {
    for (var i = 0; i < this.numWorkers; i++) {
      this.requestNewWorker()
    }
  }

  // --consonantProcesses----------------------------------------------------
  // at any time, this should be able to check on the 
  // known child processes and see if they are accounted for.
  consonantProcesses() {   // walk through the cluster worker list
    //
    cleanUpTrackedProcess()
    //
    var cw_map = cluster.workers;
    for ( var wk in cw_map ) {
      if ( !(tTracked.hasOwnProperty(wk)) ) {
        var worker = cw_map[wk];
        var nW = Object.keys(tTracked).length
        if ( (nW < this.numWorkers ) && shouldTrackWorker(worker,false) ) {  // if it is working and not tracked, then track it unless maxed out
          tTracked[wk] = new WorkerInfo(worker)
        } else if ( !(tClosers.hasOwnProperty(wk)) ) { // if the process is not already in the prune list then put it there.
          tClosers[wk] = cw_map[wk]
        }
      }
    }
    //
    var unborn = this.numWorkers -  Object.keys(tTracked).length;
    //
    return unborn
  }


  // --requestNewWorker----------------------------------------------------
  // At any time, this should be able to ask for a new worker and have that request be accepted or rejected
  // depending on our criteria.
  // Here, there are some number of processes needed, but no more.
  requestNewWorker() {
    var nW = Object.keys(tTracked).length  // assume that tracked processes are all healthy at this point.
    if ( nW < this.numWorkers ) {          // deficit of tracked processes .. proceed
      var cw_map = cluster.workers;          // look at the workers known to the cluster
      for ( var wk in cw_map ) {
        var worker = cw_map[wk] 
        //
        if ( shouldTrackWorker(worker,false) ) {  // found a healthy process not being tracked
          tTracked[wk] = new WorkerInfo(worker)           // Then it can be used instead of a new fork
          return;                                   // note: this path is unlikely but possible
        }
        //
      }
      // no excess processes needing a home so create a new one
      this.doFork()  
    }
  }


  // --refreshCache----------------------------------------------------
  refreshCache() {
    cache.clean(function(){});
  }
  
  
  // --doFork----------------------------------------------------
  doFork() {
    //
    var nW = this.numWorkers  
    if ( Object.keys(tTracked).length < nW ) {
      //
      var worker = cluster.fork() //{WORKER_ID: wid});
      //
      tTracked[worker.id] = new WorkerInfo(worker)
      //
      // whenever worker sends a message, emit it to the channels
      worker.on('message', (message) => {
        if ( this.opt.logger ) {
          this.opt.logger.writeLogRecord(message);
        }
        this.emit('message', worker, message);
      });
      worker.on('error',(e) => {
        console.log(e.message)
      })
      //
      // When a worker exits remove the worker reference from workers array, which holds all the workers
      //w.process.on('exit', () => {
      //});
      //
    }
  }


  // -----stop--------------------------------------------------
  // stop is called by terminate. The application does not call stop
  stop() {
    if ( !cluster.isMaster ) return;
    cluster.removeListener('exit', this.handleWorkerExit);
    cluster.removeListener('disconnect', this.handleWorkerDisconnect);
    cluster.removeListener('listening', this.handleWorkerListening);
    cluster.removeListener('online', this.handleWorkerOnline);
    this.stopExtantTimers()
 }



  // ========================= Application methods ...  (public)
  //
  // -----run--------------------------------------------------
  run() {
    this.forkWorkers()
  }

  // -----reload--------------------------------------------------
  reload(cb) {
    if ( !(this.mayReload) ) {
      cb("reloadng not allowed at this time")
    }
    if ( this.reloading ) {
      cb("busy reloadng")
    } else {
      //
      this.reloading = true // reloading is not reset until new processes are running and a sufficient number of stopped child processes are gone
      //
      this.refreshCache()
      untrackTrackedProcesses()
      //
      this.readyCb = () => {
        // the callback will defer the cb call until it is determined that the new processes are ready
        cb()
      }
      //
      // fork workers
      this.forkWorkers()
    }
  }

  // -----terminate--------------------------------------------------
  terminate(cb) {
    this.reloading = true // turn off reloading during shutdown
    this.shuttingdown = true // when the child process are cleand up... terminate the healthcheck interval
    if ( this.healthCheckInterval ) clearInterval(this.healthCheckInterval)
    if ( gExitCounter ) gExitCounter.stop()
    var safetyTimeout = setTimeout(() => {  // just in case this hangs
      clearOutStoppedProcesses()
      this.stop();
      cb()
    },10000)
    // this should do the trick
    cluster.disconnect(() => {
      clearTimeout(safetyTimeout);
      clearOutStoppedProcesses()
      this.stop();
      cb()
    })  // kill after disconnect by cleaning up
  }

    // -----countTracked--------------------------------------------------
    // for testing or info check
    countTracked() {
      return(Object.keys(tTracked).length)
    }

    // -----countTracked--------------------------------------------------
    // for testing or info check
    countClosing() {
      return(Object.keys(tClosers).length)
    }

    countCluster() {
      return(Object.keys(cluster.workers).length)
    }
}


// ---- ---- ---- ---- ---- ---- ----
module.exports = (file,opt) => {
  RLC = new ClusterManager(file,opt);
  return( RLC )
}


