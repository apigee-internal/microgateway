'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');
const net = require('net');
const edgeconfig = require('microgateway-config');
const gateway = require('microgateway-core');
const reloadCluster = require('./reload-cluster');
const JsonSocket = require('./json-socket');
const configLocations = require('../../config/locations');
const isWin = /^win/.test(process.platform);
const ipcPath = configLocations.getIPCFilePath();

const Gateway = function () {
};

module.exports = function () {
  return new Gateway();
};

Gateway.prototype.start =  (options) => {

  try {
    fs.accessSync(ipcPath, fs.F_OK);
    console.error('Edgemicro seems to be already running.');
    console.error('If the server is not running, it might because of incorrect shutdown of the prevous start.');
    console.error('Try removing ' + ipcPath + ' and start again');
    process.exit(1);
  } catch (e) {
    // Socket does not exist
    // so ignore and proceed
  }

  const source = configLocations.getSourcePath(options.org, options.env);
  const cache = configLocations.getCachePath(options.org, options.env);

  const keys = {key: options.key, secret: options.secret};
  const args = {target: cache, keys: keys, pluginDir: options.pluginDir};

  edgeconfig.get({source: source, keys: keys},  (err, config) => {
    if (err) {
      const exists = fs.existsSync(cache);
      console.error("failed to retieve config from gateway. continuing, will try cached copy..");
      console.error(err);
      if (!exists) {
        console.error('cache configuration ' + cache + ' does not exist. exiting.');
        return;
      } else {
        console.log('using cached configuration from %s', cache);
        config = edgeconfig.load({source: cache});
        if (options.port) {
          config.edgemicro.port = parseInt(options.port);
        }
      }
    } else {
      edgeconfig.save(config, cache);
    }

    gateway(config);

    var server = net.createServer();
    server.listen(ipcPath);

    server.on('connection',  (socket) => {
      socket = new JsonSocket(socket);
      socket.on('message', (message) => {
        if (message.command == 'reload') {
          console.log('Recieved reload instruction. Proceeding to reload');
          cluster.reload(() => {
            console.log('Reload completed');
            socket.sendMessage(true);
          });
        } else if (message.command == 'stop') {
          console.log('Recieved stop instruction. Proceeding to stop');
          cluster.terminate(() => {
            console.log('Stop completed');
            socket.sendMessage(true);
            process.exit(0);
          });
        } else if (message.command == 'status') {
          var activeWorkers = cluster.activeWorkers();
          socket.sendMessage(activeWorkers ? activeWorkers.length : 0);
        }
      });
    });
    var opt = {};
    opt.args = [JSON.stringify(args)];
    opt.timeout = 10;

    var cluster = reloadCluster(path.join(__dirname, 'start-agent.js'), opt);

    cluster.run();
    console.log('PROCESS PID : '+ process.pid);

    process.on('exit', () => {
      if (!isWin) {
        console.log('Removing the socket file as part of cleanup');
        fs.unlinkSync(ipcPath);
      }
    });

    process.on('SIGTERM', () => {
      process.exit(0);
    });

    process.on('SIGINT', () => {
      process.exit(0);
    });

  });
};

Gateway.prototype.reload = (options) => {
  const source = configLocations.getSourcePath(options.org, options.env);
  const cache = configLocations.getCachePath(options.org, options.env);
  const keys = {key: options.key, secret: options.secret};

  var socket = new JsonSocket(new net.Socket()); //Decorate a standard net.Socket with JsonSocket
  socket.on('connect', () => {
    edgeconfig.get({source: source, keys: keys}, (err, config) => {
      if (err) {
        const exists = fs.existsSync(cache);
        console.error("failed to retieve config from gateway. continuing, will try cached copy..");
        console.error(err);
        if (!exists) {
          console.error('cache configuration ' + cache + ' does not exist. exiting.');
          return;
        } else {
          console.log('using cached configuration from %s', cache);
          config = edgeconfig.load({source: cache})
        }
      } else {
        edgeconfig.save(config, cache);
      }

      gateway(config);

      socket.sendMessage({command: 'reload'});
      socket.on('message', (success) => {
        if (success) {
          console.log('Reload Completed Succesfully');
        } else {
          console.error('Reloading edgemicro was unsuccessful');
        }
        process.exit(0);
      });
    });
  });
  socket.on('error', (error)=> {
    if (error) {
      if (error.code == 'ENOENT') {
        console.error('edgemicro is not running.');
      }
    }
  });
  socket.connect(ipcPath);
};


Gateway.prototype.stop = (options) => {
  var socket = new JsonSocket(new net.Socket()); //Decorate a standard net.Socket with JsonSocket
  socket.on('connect', () => {
    socket.sendMessage({command: 'stop'});
    socket.on('message', (success) => {
      if (success) {
        console.log('Stop Completed Succesfully');
      } else {
        console.error('Stopping edgemicro was unsuccessful');
      }
      process.exit(0);
    });
  });
  socket.on('error', (error)=> {
    if (error) {
      if (error.code == 'ENOENT') {
        console.error('edgemicro is not running.');
      }
    }
  });
  socket.connect(ipcPath);
};

Gateway.prototype.status = (options) => {
  var socket = new JsonSocket(new net.Socket()); //Decorate a standard net.Socket with JsonSocket
  socket.on('connect', () => {
    socket.sendMessage({command: 'status'});
    socket.on('message', (result) => {
      console.log('edgemicro is running with '+result+' workers');
      process.exit(0);
    });
  });
  socket.on('error', (error)=> {
    if (error) {
      if (error.code == 'ENOENT') {
        console.error('edgemicro is not running.');
      }
    }
  });
  socket.connect(ipcPath);
};