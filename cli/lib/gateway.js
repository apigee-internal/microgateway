'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');
const edgeconfig = require('microgateway-config');
const gateway = require('microgateway-core');
const naught = require('naught2');
const configLocations = require('../../config/locations');


const Gateway = function () {
};

module.exports = function () {
  return new Gateway();
};

Gateway.prototype.start = function start(options) {
  const source = configLocations.getSourcePath(options.org, options.env);
  const cache = configLocations.getCachePath(options.org, options.env);
  const ipcPath = configLocations.getIPCFilePath(options.org, options.env);
  const pidPath  = configLocations.getPidFilePath(options.org, options.env);
  const clusterStatusLogPath = configLocations.getClusterStatusLogPath(options.org, options.env);
  const consoleLogPath = configLocations.getConsoleLogPath(options.org, options.env);
  const errorLogPath = configLocations.getErrorLogPath(options.org, options.env);

  const keys = { key: options.key, secret: options.secret };
  const args = { target: cache, keys: keys,pluginDir:options.pluginDir };

  edgeconfig.get({ source: source, keys: keys }, function (err, config) {
    if (err) {
      const exists = fs.existsSync(cache);
      console.error("failed to retieve config from gateway. continuing, will try cached copy..");
      console.error(err);
      if(!exists){
        console.error('cache configuration '+cache+' does not exist. exiting.');
        return;
      }else{
        console.log('using cached configuration from %s',cache);
        config = edgeconfig.load({source:cache})
          if(options.port){
            config.edgemicro.port = parseInt(options.port);
          }
      }
    } else {
      edgeconfig.save(config, cache);
    }

    const numWorkers = Number(options.processes || require('os').cpus().length);
    gateway(config);
    const naught_options = {
      'worker-count': numWorkers,
      'ipc-file': ipcPath,
      'pid-file': pidPath,
      'log': clusterStatusLogPath,
      'stdout': consoleLogPath,
      'stderr': errorLogPath,
      'max-log-size': '10485760',
      'cwd': process.cwd(),
      'daemon-mode': 'true',
      'remove-old-ipc': 'true',
      'node-args': ''
    };
    naught.start(naught_options, 'start.js', JSON.stringify(args));
  });
};

Gateway.prototype.reload = function reload(options) {
  const source = configLocations.getSourcePath(options.org, options.env);
  const cache = configLocations.getCachePath(options.org, options.env);
  const ipcPath = configLocations.getIPCFilePath(options.org, options.env);
  const pidPath = configLocations.getPidFilePath(options.org, options.env);
  const clusterStatusLogPath = configLocations.getClusterStatusLogPath(options.org, options.env);
  const consoleLogPath = configLocations.getConsoleLogPath(options.org, options.env);
  const errorLogPath = configLocations.getErrorLogPath(options.org, options.env);

  const keys = {key: options.key, secret: options.secret};

  edgeconfig.get({source: source, keys: keys}, function (err, config) {
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

    const numWorkers = Number(options.processes || require('os').cpus().length);
    gateway(config);
    const naught_options = {
      'worker-count': numWorkers,
      'ipc-file': ipcPath,
      'pid-file': pidPath,
      'log': clusterStatusLogPath,
      'stdout': consoleLogPath,
      'stderr': errorLogPath,
      'max-log-size': '10485760',
      'cwd': process.cwd(),
      'daemon-mode': 'true',
      'remove-old-ipc': 'false',
      'node-args': ''
    };
    naught.deploy(naught_options, ipcPath);
  });
};

Gateway.prototype.stop = function stop(options) {
  const ipcPath = configLocations.getIPCFilePath(options.org, options.env);
  const pidPath = configLocations.getPidFilePath(options.org, options.env);

  const naught_options = {
    'pid-file': pidPath
  };
  naught.stop(naught_options, ipcPath);
};

Gateway.prototype.status = function stop(options) {
  const ipcPath = configLocations.getIPCFilePath(options.org, options.env);
  naught.status(ipcPath);
};