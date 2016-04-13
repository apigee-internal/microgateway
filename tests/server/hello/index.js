'use strict';
const cluster = require('cluster');
const os = require('os')

if (cluster.isMaster) {
  const numWorkers = 4;//Number(require('os').cpus().length);
  cluster.setupMaster();
  const argv = cluster.settings ? cluster.settings.execArgv || [] : [];
  var j = 0;
  argv && argv.forEach((arg) => {
    if (arg.includes('--debug-brk=')) {
      argv[j] = arg.replace('--debug-brk', '--debug')
    }
    j++;
  })
  console.log("starting in cluster mode: number workers: " + numWorkers)

  // Fork workers.
  for (var i = 0; i < numWorkers; i++) {
    cluster.fork();
  }

  cluster.on('death', function (worker) {
    console.log('worker ' + worker.pid + ' died');
  });
  return;
}
require('./hello')(true).listen(3000)