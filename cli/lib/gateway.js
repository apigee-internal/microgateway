'use strict';
const path = require('path');
const assert = require('assert');
const cluster = require('cluster');
const os = require('os');
const edgeconfig = require('microgateway-config');

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
  const args = { target: cache, keys: keys };
  const that = this;
  if (cluster.isMaster) {
    edgeconfig.get({ source: source, keys: keys }, function (err, config) {
      if (err) {
        console.error("failed to retieve config from gateway. continuing, will try cached copy..");
        console.error(err);
      }else{
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
        console.log("starting in cluster mode: number workers: " + numWorkers)

        // Fork workers.
        for (var i = 0; i < numWorkers; i++) {
          cluster.fork();
        }

        cluster.on('death', function (worker) {
          console.log('worker ' + worker.pid + ' died');
        });
        cb(null, {
          close: function (cb) {
            cluster.disconnect(cb);
          }
        });
      } else {
        console.log("starting in non-cluster mode")
        startServer(that, args, cb);
      }
    });
    return;
  } else {
    console.log("starting fork")
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

