'use strict';
const edgeConfig = require('microgateway-config');
const agent = require('./server')();
const path = require('path');
const targetDir = path.join(__dirname, '..', 'config');
const fs = require('fs');
const cacheFile = 'cache-config.yaml';
const targetPath = path.join(targetDir,cacheFile);

/**
 * starts an configures agent
 * @param env {source,target,keys{key,secret}}
 * @param cb
 */
module.exports = function configureAndStart(options,cb) {
  fs.exists(targetPath, (exists)=> {
    if (exists) {
      const config = edgeConfig.load({source: targetPath});
      startServer(options.keys, config, cb);
    } else {
      getConfigStart(options, cb);
    }
  });
};

const getConfigStart =function getConfigStart(options, cb) {
  edgeConfig.get({source: options.source, keys: options.keys}, function (e, config) {
    edgeConfig.save(config, targetPath);
    if (e) {
      return cb(e)
    }
    startServer(options.keys, config, cb);
  });
};

const startServer = function startServer(keys, config, cb){
  agent.start(keys,config,function (err) {
    cb(err,agent);
  });
}