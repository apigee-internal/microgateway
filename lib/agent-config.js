'use strict';
const edgeConfig = require('microgateway-config');
const agent = require('./agent')();
/**
 * starts an configures agent
 * @param env {source,target,keys{key,secret}}
 * @param cb
 */
module.exports = function configureAndStart(env,cb){
  edgeConfig.get({source:env.source,target:env.target,keys:env.keys},function(e,config) {
    if (e) {
      return cb(e)
    }
    agent.start(env.keys,config,function (err) {
      cb(err,agent);
    });
  });
}