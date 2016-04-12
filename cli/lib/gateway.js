'use strict';
const path = require('path');
const assert = require('assert');
const runner = require('../../lib/process');
const cluster = require('cluster');

const edgeconfig = require('microgateway-config');

const configLocations = require('../../config/locations');
const agentConfig = require('../../lib/agent-config');

const Gateway = function() {
}

module.exports = function() {
  return new Gateway();
}

Gateway.prototype.start = function start(options, cb) {
  const that = this;
  const source = configLocations.getSourcePath(options.org, options.env);
  const cache = configLocations.getCachePath(options.org, options.env);

  if (options.cluster && cluster.isMaster) {
    const numCPUs = Number(options.processes || require('os').cpus().length);
    cluster.setupMaster();
    const argv = cluster.settings ? cluster.settings.execArgv || [] : [];
    var j = 0;
    argv && argv.forEach((arg)=>{
      if(arg.includes('--debug-brk=')){
        argv[j] = arg.replace('--debug-brk','--debug')
      }
      j++;
    })
    // Fork workers.
    for (var i = 0; i < numCPUs; i++) {
      cluster.fork();
    }

    cluster.on('death', function(worker) {
      console.log('worker ' + worker.pid + ' died');
    });
  }
  const keys = { key: options.key, secret: options.secret };
  const args = { source: source, target: cache, keys: keys, ignorecachedconfig: options.ignorecachedconfig };
  agentConfig(args, function(e, agent) {
    if (e) {
      console.error('edge micro failed to start', e);
      process.exit(1);
    }
    console.log('edge micro started');
    that.agent = agent;
    cb(null, agent);
  });
}




function optionError(message) {
  console.error(message);
  if (this.help) {
    this.help();
  }
}

