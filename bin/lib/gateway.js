'use strict'; 
const path = require('path');
const assert = require('assert');
const runner = require('../../lib/process');
const request = require('request');
const edgeConfig = require('microgateway-config');

const targetDir = path.join(__dirname, '..','..', 'config');
const sourceFile = 'config.yaml';
const sourcePath = path.join(targetDir,sourceFile);
const targetPath = path.join( targetDir, 'cache-config.yaml');
const config = edgeConfig.load({source:targetPath});
const agentConfig = require('../../lib/agent-config');


module.exports = {
  start: function start(options) {
    if (!options.key) {
      return optionError.bind(this)('key is required');
    }
    if (!options.secret) {
      return optionError.bind(this)('secret is required');
    }
    if (options.forever) {
      runner(options, sourcePath, targetPath);
    } else {
      const keys = {key: options.key, secret: options.secret};
      agentConfig({source: sourcePath, target: targetPath, keys: keys}, function (e, agent) {
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

