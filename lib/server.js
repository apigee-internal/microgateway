'use strict';
const edgeConfig = require('microgateway-config');
const _ = require('lodash')
const assert = require('assert');

const extractEnv = function extractEnv(cb){
  assert(process.env.EDGEMICRO_KEY,'env must have EDGEMICRO_KEY');
  assert(process.env.EDGEMICRO_SECRET,'env must have EDGEMICRO_SECRET');
  assert(process.env.SOURCE_CONFIG_PATH,'env must have SOURCE_CONFIG_PATH');
  assert(process.env.TARGET_CONFIG_PATH,'env must have TARGET_CONFIG_PATH');

  const keys = {
    key:process.env.EDGEMICRO_KEY,
    secret: process.env.EDGEMICRO_SECRET
  };

  edgeConfig.get({source:process.env.SOURCE_CONFIG_PATH,target:process.env.TARGET_CONFIG_PATH,keys:keys},function(e,config) {
    if (e) {
      return cb(e)
    }
    if (!_.isUndefined(process.env.EDGEMICRO_PORT) && _.isNumber(process.env.EDGEMICRO_PORT)) {
      config.edgemicro.port = process.env.EDGEMICRO_PORT;
    }
    if (!_.isUndefined(process.env.EDGEMICRO_TARGET) && _.isString(process.env.EDGEMICRO_TARGET)) {
      config.edgemicro.address = process.env.EDGEMICRO_TARGET;
    }
    cb(null,
      keys,
      config
    );

  });

};

extractEnv(function(err,keys,config){
  const app = require('./agent')(config);

  app.start(keys,function (err) {
    if (err) {
      console.error('edgemicro failed to start agent', err);
      process.exit(1);
    }
  });
});
