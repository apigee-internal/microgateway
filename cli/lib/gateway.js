'use strict';
const path = require('path');
const assert = require('assert');
const cluster = require('cluster');
const os = require('os');
const fs = require('fs');
const edgeconfig = require('microgateway-config');
const gateway = require('microgateway-core');
const configLocations = require('../../config/locations');
const agentConfig = require('../../lib/agent-config');

const Gateway = function () {
}

module.exports = function () {
  return new Gateway();
}

Gateway.prototype.start = function start(options, cb) {
  const source = configLocations.getSourcePath(options.org, options.env);
  const cache = configLocations.getCachePath(options.org, options.env);
  const keys = { key: options.key, secret: options.secret };
  const args = { target: cache, keys: keys,pluginDir:options.pluginDir };
  const that = this;

  if (cluster.isMaster) {
    edgeconfig.get({ source: source, keys: keys }, function (err, config) {
      
      if(options.port){
        config.edgemicro.port = parseInt(options.port);
      }

      if (err) {
        const exists = fs.existsSync(cache);
        console.error("failed to retieve config from gateway. continuing, will try cached copy..");
        console.error(err);
        if(!exists){
          return cb('cache configuration '+cache+' does not exist. exiting.');
        }else{
          console.log('using cached configuration from %s',cache);
          config = edgeconfig.load({source:cache})
          if(options.port){
            config.edgemicro.port = parseInt(options.port);
          }
        }
      } else {
        edgeconfig.save(config, cache);
      }

      if (options.cluster) {

        const numWorkers = Number(options.processes || require('os').cpus().length);
        cluster.setupMaster();
        const argv = cluster.settings ? cluster.settings.execArgv || [] : [];
        var j = 0;
        argv && argv.forEach((arg) => {
          if (arg.includes('--debug-brk=')) {
            argv[j] = arg.replace('--debug-brk', '--debug')
          }
          j++;
        })
        cluster.isMaster && console.log("starting in cluster mode: number workers: " + numWorkers)
        // Fork workers.
        for (var i = 0; i < numWorkers; i++) {
          cluster.fork();
        }

        gateway(config);

        cluster.on('death', function (worker) {
          console.log('worker ' + worker.pid + ' died');
        });

        cb(null, {
          close: function (cb) {
            cluster.disconnect(cb);
          }
        });
      } else {
        cluster.isMaster &&  console.log("starting in non-cluster mode")
        startServer(that, args, cb);
      }
    });
    return;
  } else {
    startServer(that, args, cb);
  }
}

function startServer(that, args, cb) {
  assert(args)
  assert(cb)
  agentConfig(args, function (e, agent) {
    if (e) {
      console.error('edge micro failed to start', e);
      cb(e);
    }
    cluster.isMaster && console.log('edge micro started');
    that.agent = agent;
    cb(null, agent);
  });
}


