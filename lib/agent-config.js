'use strict';
const edgeConfig = require('microgateway-config');
const agent = require('./server')();
const path = require('path');
const fs = require('fs');
const assert = require('assert')


/**
 * starts an configures agent
 * @param env {source,target,keys{key,secret}}
 * @param cb
 */
module.exports = function configureAndStart(options,cb) {
  assert(options.source,'must have source')
  assert(options.target,'must have target')
  fs.exists(options.target, (exists) => {
    if (options.ignorecachedconfig) {
      console.log('ignoring cached config')
    }
    if (exists && !options.ignorecachedconfig) {
      const config = edgeConfig.load({source: options.target});
      startServer(options.keys, config, cb);
    } else {
      getConfigStart(options, cb);
    }
  });
};

const getConfigStart =function getConfigStart(options, cb) {
  edgeConfig.get({source: options.source, keys: options.keys}, function (e, config) {
    edgeConfig.save(config, options.target);
    if (e) {
      return cb(e)
    }
    startServer(options.keys, config, cb);
  });
};

const startServer = function startServer(keys, config, cb){
  agent.start(keys,config,function (err) {
    cb(err,agent,config);
  });
}