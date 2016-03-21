'use strict'; 
const path = require('path');
const assert = require('assert');
const runner = require('../../lib/process');
const request = require('request');

const targetDir = path.join(__dirname, '..','..', 'config');
const sourceFile = 'config.yaml';
const sourcePath = path.join(targetDir,sourceFile);
const agentConfig = require('../../lib/agent-config');


module.exports = {
  start: function start(options) {
    const defaultKey = process.env.EDGEMICRO_KEY
    const defaultSecret = process.env.EDGEMICRO_SECRET
    if (!options.key && !defaultKey) {
      return optionError.bind(this)('key is required');
    }
    if (!options.secret && !defaultSecret) {
      return optionError.bind(this)('secret is required');
    }
    if(defaultKey){
      options.key = options.key || defaultKey;
    }
    if(defaultSecret){
      options.secret = options.secret || defaultSecret;
    }
    const source = options.sourcePath || sourcePath;
    if (options.forever) {
      runner(options, source);
    } else {
      const keys = {key: options.key, secret: options.secret};
      agentConfig({source: source,  keys: keys}, function (e, agent) {
        if (e) {
          console.error('agent failed to start',e);
          process.exit(1);
        }
        console.log('agent started');
      });
    }

  }
};


function optionError(message) {
  console.error(message);
  this.help();
}

