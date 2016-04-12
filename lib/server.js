'use strict'
const gateway = require('./gateway');
const assert = require('assert');
const path = require('path');
const os = require('os');
const url = require('url');
const _ = require('lodash');
const cluster = require('cluster')
/**
 *  new agent
 */
const Agent = function () {
};

module.exports = function () {
  return new Agent();
};

// use to close down the current agent connections
Agent.prototype.close = function close(cb) {
  if (this.gatewayServer) {
    this.gatewayServer.stop();
    this.gatewayServer = null;
    cb && cb();
  } else {
    cb && cb();
  }
}

/**
 * use to start edgemicro instance with key and secret
 * token: {key,secret}
 */
Agent.prototype.start = function start(token, clusterOptions, config, cb) {

 if (clusterOptions.cluster && cluster.isMaster) {
    const numWorkers = Number(clusterOptions.processes || require('os').cpus().length);
    cluster.setupMaster();
    const argv = cluster.settings ? cluster.settings.execArgv || [] : [];
    var j = 0;
    argv && argv.forEach((arg) => {
      if (arg.includes('--debug-brk=')) {
        argv[j] = arg.replace('--debug-brk', '--debug')
      }
      j++;
    })
    console.log("starting in cluster mode: number workers: " + numWorkers)

    // Fork workers.
    for (var i = 0; i < numWorkers; i++) {
      cluster.fork();
    }

    cluster.on('death', function (worker) {
      console.log('worker ' + worker.pid + ' died');
    });
    cb(null, {
      close: function (cb) {
        cluster.disconnect(cb);
      },config
    });
    return;
  }
  assert(token, 'must have a token');
  assert(config, 'configpath cant be empty');

  const key = token.key;
  const secret = token.secret;

  assert(key, 'must have EDGEMICRO_KEY');
  assert(secret, 'must have EDGEMICRO_SECRET');

  config.keys = {
    key: key,
    secret: secret
  };

  if (config.keys && config.keys.key && config.keys.secret) {
    if (_isLoopback(config)) {
      return cb && cb(new Error("Error - loopback scenario identified, halting start-up"));
    }
    this.gatewayServer = gateway(config);
    this.gatewayServer.start((err) => {
      err && console.error(err);
      cb && cb(null, config);

    });

  } else {
    return cb && cb(new Error('edgemicro - start needs EDGEMICRO_KEY and EDGEMICRO_SECRET'));
  }
}


// identifies loopback scenarios between edgemicro and edgemicro-aware proxies
const _isLoopback = function _isLoopback(config) {
  const ni = os.networkInterfaces(); // all possible network interfaces
  if (!config.proxies) {
    return false;
  }
  // iterate over all downloaded proxies
  return config.proxies.some(function (proxy) {
    const parsedProxy = url.parse(proxy['url']);
    // iterate over network interfaces
    return Object.keys(ni).some((interfaces) => {
      return ni[interfaces].some((inter) => {
        const hasLoopBack = inter['address'] === parsedProxy.hostname
          && config.edgemicro.port == parsedProxy.port;
        return hasLoopBack;
      });
    });
  });
};
