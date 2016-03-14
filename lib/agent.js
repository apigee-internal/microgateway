'use strict'
const edgeConfig = require('microgateway-config');
const gateway = require('./gateway');
const server = require('./server');
const assert = require('assert');
const path = require('path');
const os = require('os');
const url = require('url');
/**
 *  new agent
 */
const Agent = function(configPath){
  this.configPath = configPath ||  path.join(__dirname, 'config', 'config.yaml');
};

module.exports = function(configPath) {
  return new Agent(configPath);
};

/**
 * load config
 * token:{key,secret}
 */
Agent.prototype.loadConfig = function loadConfig(token) {
  const configPath = this.configPath;
  const config = _getConfig(configPath);

  assert(config, 'config is empty');
  assert(token, 'must have a token');

  const key = token.key;
  const secret = token.secret;

  assert(key, 'must have EDGEMICRO_KEY');
  assert(secret, 'must have EDGEMICRO_SECRET');

  config.keys = {
    key: key,
    secret: secret
  };
  this.config = config;
  return config;
}

// use to close down the current agent connections
Agent.prototype.close = function close(cb) {
  if (this.restServer) {
    this.restServer.close();
    this.restServer = null;
  }
  if (this.gatewayServer) {
    this.gatewayServer.stop();
    this.gatewayServer = null;
    cb();
  } else {
    cb();
  }
}

/**
 * use to start edgemicro instance with key and secret
 * token: {key,secret}
 */
Agent.prototype.start = function start(token, cb) {
  const config = this.loadConfig(token);
  if (config.keys && config.keys.key && config.keys.secret) {
    if (_isLoopback(config)) {
      return cb(new Error("Error - loopback scenario identified, halting start-up"));
    }
    this.gatewayServer = gateway(config);
    this.gatewayServer.start((err) => {
      err && console.log(err);
    });
    if (!this.restServer) {
      this.restServer = server(config, this.gatewayServer);
      this.restServer.start();
    }
    cb(null, config);
  } else {
    return cb(new Error('edgemicro - start needs EDGEMICRO_KEY and EDGEMICRO_SECRET'));
  }
}

const _getConfig = function _getConfig(configPath) {
  return edgeConfig.load({ source: configPath })
};

// identifies loopback scenarios between edgemicro and edgemicro-aware proxies
const _isLoopback = function _isLoopback(config) {
  const ni = os.networkInterfaces(); // all possible network interfaces
  if (!config.proxies) {
    return false;
  }
  // iterate over all downloaded proxies
  return config.proxies.some(function(proxy) {
    const parsedProxy = url.parse(proxy['url']);
    // iterate over network interfaces
    return   Object.keys(ni).some((interfaces) => {
      return ni[interfaces].some((inter) => {
        const hasLoopBack = inter['address'] === parsedProxy.hostname
          && config.edgemicro.port == parsedProxy.port;
        return hasLoopBack;
      });
    });
  });
};
