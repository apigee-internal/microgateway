'use strict';
const forever = require('forever-monitor');
const assert = require('assert');  

var child;
/**
 * this library will instantiate the agent under the forever process
 * @param options {key,secret}
 * @param source - source path to config
 * @param target - target config
 */
module.exports =  function start(options, config, source, target){

  assert(options,'options must be present');
  assert(options.key,'env must have EDGEMICRO_KEY');
  assert(options.secret,'env must have EDGEMICRO_SECRET');
  assert(options.source,'must have source')
  assert(options.target,'must have target')

  const env = {
    EDGEMICRO_KEY:options.key,
    EDGEMICRO_SECRET:options.secret,
    SOURCE_CONFIG_PATH:source,
    TARGET_CONFIG_PATH: target
  };

  const max = config.agent && config.agent.max_times ? config.agent.max_times : 50;
  const sleep = config.agent && config.agent.spin_sleep_time ? config.agent.spin_sleep_time : 1000;
  const up = config.agent && config.agent.min_up_time ? config.agent.min_up_time : 10000;
  console.log("config: min_up_time:",up);
  console.log("config: spin_sleep_time:",sleep);
  console.log("config: max_times:",max);

  child = new (forever.Monitor)('./lib/process-instance.js', {
    max: max,
    spinSleepTime: sleep,
    minUptime: up,
    env: env
  });

  child.on('exit', function () {
    console.error('server has exited after 3 restarts');
  });


  child.start();
};

