'use strict';
const path = require('path');
const debug = require('debug');
const os = require('os');
const url = require('url');
const edgeconfig = require('edgemicro-config');
const d = debug('agent:proc');
const sym = require('log-symbols');
const gateway = require('./gateway');
var uuid = require('uuid');

const defaultConfigSource = path.join(os.homedir(), '.edgemicro', 'config.yaml');
var started = 0;
var restarts = 0;
const proc = exports.proc = {};
var gatewayService = null;
proc.get = function get(cb) {
  cb(null, {since: started, restarts: restarts, running: started != 0});
};

function startCommon(edgeConf, cb) {
  if (!checkForLoopback(edgeConf)) {
    console.error('Error - loopback scenario identified, halting start-up');
    return cb(new Error("Error - loopback scenario identified, halting start-up"))
  }

  gatewayService = gateway(edgeConf);
  gatewayService.start(function (err, server) {
    started = Date.now();
    err && d(sym.error, err);
    cb(err, server);
  });
}

proc.startImmediate = function startImmediate(edgeConf, cb) {
  return startCommon(edgeConf, cb);
}

proc.start = function start(edgeConf, cb) {
  d(sym.info, 'proc.start', JSON.stringify(edgeConf));

  return startCommon(edgeConf, cb);
}

function resetEventHandler(operation, edgeConf, cb) {
  // remove existing handlers, if any

  started = Date.now();
  var configChanged = false;

  var restart = (cb)=> {
    gatewayService.stop((err) => {
      if (err) {
        return cb(err);
      }
      gatewayService = gateway(edgeConf);
      gatewayService.start(function (err) {
        restarts++;
        if (err) {
          return cb(err);
        }
        cb(null,configChanged);

      })

    });
  }
  switch (true) {
    case operation === 'reload' :
      const keys = {
        key: edgeConf.analytics.key,
        secret: edgeConf.analytics.secret
      };
      edgeconfig.get({source: defaultConfigSource, target: null, keys: keys}, function (err, conf) {
        configChanged = true;
        if (err) {
          return cb(err);
        }
        if (conf._hash !== edgeConf._hash) {
          edgeConf = conf; // save updated conf, and initiate a graceful restart
          restart(cb);
        } else {
          return cb(err,configChanged);
        }
      });

      break;
    case operation === 'stop':
      gatewayService.stop((err)=> {
        started = 0;
        cb(err);
      });
      break;
    case operation === 'restart':
    case operation === 'reset':
      restart(cb);
      break;
  }
}

proc.cycle = function cycle(operation, edgeConf, cb) {
  d(sym.info, 'proc.cycle', operation);
  if (operation !== 'stop' &&
    operation !== 'restart' &&
    operation !== 'reload' &&
    operation !== 'reset') {
    cb('wrong type of process signal ' + operation);
    return;
  }

  resetEventHandler(operation, edgeConf, cb);
}

// identifies loopback scenarios between edgemicro and edgemicro-aware proxies
function checkForLoopback(conf) {
  const ni = os.networkInterfaces(); // all possible network interfaces
  // iterate over all downloaded proxies
  return !conf.proxies.some(function (proxy) {
    const parsedProxy = url.parse(proxy['url']);
    // iterate over network interfaces
    return Object.keys(ni).some(function (interfaces) {
      return ni[interfaces].some(function (inter) {
        return (inter['address'] === parsedProxy.hostname &&
        conf.edgemicro.port == parsedProxy.port);
      });
    });
  });
}
