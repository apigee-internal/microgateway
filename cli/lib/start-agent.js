'use strict';

const cluster = require('cluster');
const agentConfig = require('../../lib/agent-config');
const assert = require('assert');

var args;

process.argv.forEach((val /*, index, array */) => {
  args = val;
});

const argsJson = JSON.parse(args);
assert(argsJson);

agentConfig(argsJson, (e) => {
  if (e) {
    console.error('edge micro failed to start', e);
    return;
  }
  if (!cluster.isMaster) {
    if (process.send) process.send('online');
    process.on('message', (message) => {
      if (message === 'shutdown') {
        process.exit(0);
      }
    });
  } else {
    console.log('edge micro started');
  }
});