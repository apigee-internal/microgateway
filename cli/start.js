'use strict';

const cluster = require('cluster');
const agentConfig = require('../lib/agent-config');
const assert = require('assert');

var args;

process.argv.forEach(function (val, index, array) {
  args = val;
});

const argsJson = JSON.parse(args);
assert(argsJson);

agentConfig(argsJson, function (e) {
  if (e) {
    console.error('edge micro failed to start', e);
    return;
  }
  if (!cluster.isMaster) {
    if (process.send) process.send('online');
    process.on('message', function (message) {
      if (message === 'shutdown') {
        process.exit(0);
      }
    });
  } else {
    cluster.setupMaster();
    const argv = cluster.settings ? cluster.settings.execArgv || [] : [];
    var j = 0;
    argv && argv.forEach((arg) => {
      if (arg.includes('--debug-brk=')) {
        argv[j] = arg.replace('--debug-brk', '--debug')
      }
      j++;
    });
    console.log('edge micro started');
  }
});