'use strict';

// start agent.js :  This is the top of a cluster child

const cluster = require('cluster');
//const agentConfig = require('../../lib/agent-config');
const assert = require('assert');
const fs = require('fs')

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

    var reloadMaxTime = fs.readFileSync(__dirname + '/rateset.txt','ascii').toString()
    reloadMaxTime = parseInt(reloadMaxTime)
    
    if ( reloadMaxTime > 0 ) {
      var rT = Math.trunc(Math.round(Math.random()*reloadMaxTime))
      rT = parseInt('' + rT)
      console.log(rT)

      setTimeout(() => {
        process.exit(0)
      },rT)
    } else {
      setInterval(()=>{
        console.log("HAPPY",5000)
      })
    }
 } else {
  console.log('gauged fails started');
 }
}

check()