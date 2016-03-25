'use strict'; 
const path = require('path');
const assert = require('assert');
const runner = require('../../lib/process');
const edgeconfig = require('microgateway-config');

const configLocations = require('../../config/locations');
const agentConfig = require('../../lib/agent-config');


module.exports = {
  start: function start(options) {
    const defaultKey = process.env.EDGEMICRO_KEY
    const defaultSecret = process.env.EDGEMICRO_SECRET
    if (!options.key && !defaultKey) {
      return optionError.bind(options)('key is required');
    }
    if (!options.secret && !defaultSecret) {
      return optionError.bind(options)('secret is required');
    }
    if (!options.org) { return optionError.bind(options)('org is required'); }
    if (!options.env) { return optionError.bind(options)('env is required'); }
    if(defaultKey){
      options.key = options.key || defaultKey;
    }
    if(defaultSecret){
      options.secret = options.secret || defaultSecret;
    }
     

    const source = configLocations.getSourcePath(options.org,options.env);
    const cache = configLocations.getCachePath(options.org,options.env);
    if (options.forever) {
      const config = edgeconfig.load({ source: source });
      runner(options, config, source, cache);
    } else {
      const keys = {key: options.key, secret: options.secret};
      agentConfig({source: source,target: cache,  keys: keys,ignorecachedconfig:options.ignorecachedconfig}, function (e, agent) {
        if (e) {
          console.error('edge micro failed to start',e);
          process.exit(1);
        }
        console.log('edge micro started');
      });
    }

  }
};


function optionError(message) {
  console.error(message);
  if(this.help){
    this.help();
  }
}

