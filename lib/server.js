'use strict'
const gateway = require('./gateway');
const assert = require('assert');
const os = require('os');
const url = require('url');
//const path = require('path');
//const _ = require('lodash');
//const cluster = require('cluster')
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
    if ( cb ) cb();
  } else {
    if ( cb ) cb();
  }
}

/**
 * use to start edgemicro instance with key and secret
 * token: {key,secret}
 */
Agent.prototype.start = function start(token,pluginDir, config, cb) {


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


    if(process.env.PORT) {
      config.edgemicro.port = process.env.PORT;
    }

    this.gatewayServer = gateway(pluginDir,config);  // CALL gateway module
    this.gatewayServer.start((err) => {
      if ( err ) console.error(err);
      if ( cb ) cb(null, config);

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
        const hasLoopBack = ((inter['address'] === parsedProxy.hostname) && (config.edgemicro.port === parsedProxy.port));
        return hasLoopBack;
      });
    });
  });
};
