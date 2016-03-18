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
    if (options.forever) {
      runner(options, sourcePath, targetPath);
    } else {
      const keys = {key: options.key, secret: options.secret};
      edgeConfig.get({source: sourcePath, target: targetPath, keys: keys}, function (e, config) {
        if (e) {
           console.error(e);
          process.exit(1);
        }
        const agent = require('../../lib/agent')(config);

        agent.start(keys, function (err) {
          if (err) {
            console.error('edgemicro failed to start agent', err);
            process.exit(1);
          }
        });
      });
    }

  }
};


function optionError(message) {
  console.error(message);
  this.help();
}

