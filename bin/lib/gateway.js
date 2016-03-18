'use strict'; 
const path = require('path');
const assert = require('assert');
const runner = require('../../lib/runner');
const request = require('request');
const edgeConfig = require('microgateway-config');

const targetDir = path.join(__dirname, '..','..', 'config');
const sourceFile = 'config.yaml';
const sourcePath = path.join(targetDir,sourceFile);
const targetPath = path.join( targetDir, 'cache-config.yaml');
const config = edgeConfig.load({source:targetPath});


module.exports = {
  start: function start(options) {
    if (!options.key) {
      return optionError.bind(this)('key is required');
    }
    if (!options.secret) {
      return optionError.bind(this)('secret is required');
    }
    runner(options, sourcePath, targetPath);
  },
  stop: function stop(options) {
    const port = config.agent.port || 9000;
    request('http://localhost:'+port+'/stop', {method:'POST'}, (err, r, b)=> {
      err && console.error(err);
      console.log('request finished.')
      !err && console.log(JSON.stringify(b));
    });
  }
};

function optionError(message) {
  console.error(message);
  this.help();
}

