'use strict';
const edgeconfig = require('microgateway-config');
const path = require('path');
const assert = require('assert');
const _ = require('lodash');

const targetDir = path.join(__dirname, '..', 'config');
const sourceFile = 'config.yaml';
const sourcePath = path.join(targetDir,sourceFile);
const targetPath = path.join( targetDir, 'cache-config.yaml');
const agent = require('../lib/agent')(targetPath);

module.exports = function gateway(options) {
  if (!options.key) { return optionError.bind(this)('key is required'); }
  if (!options.secret) { return optionError.bind(this)('secret is required'); }

  run(options);

  return;
};

const run = function run(options){
  const keys = {key:options.key,secret:options.secret};
  edgeconfig.get({source:sourcePath,target:targetPath,keys:keys},function(e,config){
    if(!_.isUndefined(options.port) && _.isNumber(options.port)){
      config.edgemicro.port = options.port;
    }
    if(!_.isUndefined(options.target) && _.isString(options.target)){
      config.edgemicro.address = options.target;
    }
    agent.start(keys,config,function (err) {
      console.log('agent started')
    });
  });
};
