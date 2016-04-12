'use strict';
const edgeConfig = require('microgateway-config');
const agent = require('./server')();
const path = require('path');
const fs = require('fs');
const assert = require('assert')
const cluster =require('cluster')

/**
 * starts an configures agent
 * @param env {source,target,keys{key,secret}}
 * @param cb
 */
module.exports = function configureAndStart(options, cb) {
  assert(options.source, 'must have source')
  assert(options.target, 'must have target')
  getConfigStart(options, cb);
};

const getConfigStart = function getConfigStart(options, cb) {
  console.log ('pulling down the latest configuration from Edge');

  edgeConfig.get({ source: options.source, keys: options.keys }, function(err, config) {
    if (err) {
      console.error("failed to retieve config from gateway.");
      console.error(err);
      fs.exists(options.target, (exists) => {
        if (exists) {
          console.error("using cache="+options.target);
          const config = edgeConfig.load({ source: options.target });
          startServer(options.keys, config, cb);
        } else {
          return cb(e)
        }
      });
    }
    edgeConfig.save(config, options.target);
    startServer(options.keys,{cluster:options.cluster,processes:options.processes}, config, cb);
  });
};

const startServer = function startServer(keys,clusterOptions, config, cb) {

  agent.start(keys,clusterOptions, config, function(err) {
    cb(err, agent, config);
  });
}