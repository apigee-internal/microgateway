'use strict';
const assert = require('assert');
const agentConfig =  require('./agent-config')

/**
 * extracts env vars
 * @returns {{source, target, keys: {key: *, secret: *}}}
 */
const extractEnv = function extractEnv(){
  assert(process.env.EDGEMICRO_KEY,'env must have EDGEMICRO_KEY');
  assert(process.env.EDGEMICRO_SECRET,'env must have EDGEMICRO_SECRET');
  assert(process.env.SOURCE_CONFIG_PATH,'env must have SOURCE_CONFIG_PATH');

  const keys = {
    key:process.env.EDGEMICRO_KEY,
    secret: process.env.EDGEMICRO_SECRET
  };
  const env = {source:process.env.SOURCE_CONFIG_PATH,keys:keys};
  return env;
};

const env = extractEnv();
agentConfig(env,(err,agent)=> {
  if (err) {
    console.error('edgemicro failed to start agent', err);
    process.exit(1);
  } else {
    console.log('edgemicro started!')
  }
});


