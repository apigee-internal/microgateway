'use strict';

// start agent.js :  This is the top of a cluster child

const cluster = require('cluster');
//const agentConfig = require('../../lib/agent-config');
const assert = require('assert');

var args;

process.argv.forEach((val /*, index, array */) => {
  args = val;
});

//const argsJson = JSON.parse(args);
//assert(argsJson);


function check() {
  if ( !cluster.isMaster ) {

    if (process.send) process.send('online');

    process.on('message', (message) => {
      if (message === 'shutdown') {
        process.exit(0);
      }
    });

    var rT = Math.trunc(Math.round(Math.random()*5000))
    rT = parseInt('' + rT)
    console.log(rT)

    setTimeout(() => {
      process.exit(0)
    },rT)

 } else {
   console.log('random fails started');
 }
}

check()