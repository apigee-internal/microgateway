'use strict';
const express = require('express');
const edgeConfig = require('microgateway-config');
const bodyParser = require('body-parser');
const path = require('path');
const os = require('os')
const help = require('./http_helpers').http_helpers;
const sym = require('log-symbols');
const proc = require('./proc').proc;
var networkConfig;
var server;
var app;
const initialConfig = edgeConfig.load();
var port = initialConfig.agent.port || process.env.PORT || 9000;
var hostname = initialConfig.agent.address || process.env.ADDRESS;
const defaultConfigSource = path.join(os.homedir(), '.edgemicro', 'config.yaml');

// use to initialize a new instance of the agent
function init(cb) {
  port = initialConfig.agent.port || process.env.PORT || 9000;
  hostname = initialConfig.agent.address || process.env.ADDRESS;
  // initialize new express app and begin set up
  app = express();
  app.use(bodyParser.json());
  app.route('/proc')
    .get((req,res)=>{
      proc.get(function(err,ack){
        if(!ack.since)
          res.sendStatus(404);
        else {
          res.sendStatus(200, {running:ack.running,since:ack.since,restarts:ack.restarts});
        }
      })
    })
    .post(function (req, res) {
      const keys = extractKeys(req);
      if (networkConfig) {
        proc.start( networkConfig, (err)=> {
          if (err) {
            help.error(508, res, err);
          } else {
            proc.get(function(err,ack){
              help.status(200, res).send({running:ack.running ,since:ack.since,restarts:ack.restarts});
            })
          }
        });
      } else {
        edgeConfig.get({source: defaultConfigSource, target: null, keys: keys}, function (err, conf) {
          if (err) {
            return res.send(500, "failed to retrieve config")
          }
          proc.start(conf, (err)=> {
            if (err) {
              help.error(500, res, err);
            } else {
              networkConfig = conf;
              proc.get(function(err,ack){
                help.status(200, res).send({running:ack.running ,since:ack.since,restarts:ack.restarts});
              })
            }
          });

        });
      }
    })
    .put(function (req, res) {
      if (networkConfig) {
        const operation = req.body.operation;
        proc.cycle(operation, networkConfig, (err,configChanged)=> {
          if (err) {
            help.error(500, res, err);
          }
          proc.get(function(err,ack){
            help.status(200, res).send({running:ack.running ,since:ack.since,restarts:ack.restarts,configChanged:configChanged});
          })
        });
      } else {
        help.error(400, res); // Bad Request
      }
    });

  if (hostname) {
    server = app.listen(port, hostname, function () {
      console.info(sym.info, 'edge micro agent listening on', hostname +
        ':' + port);
    });
  } else {
    server = app.listen(port, function () {
      console.info(sym.info, 'edge micro agent listening on', port);
    });
  }

  // autostart if key and secret are available as env consts
  const keys = {
    key: process.env['EDGEMICRO_KEY'],
    secret: process.env['EDGEMICRO_SECRET']
  };
  if (keys.key && keys.secret) {
    start(keys, function (err, conf) {
      if (err) {
        console.error('edgemicro - failed to start edge micro: ', err);
        return cb(new Error(err));
      }
      return cb();
    });
  } else {
    if (!server) {
      return cb(new Error('edgemicro - failure starting agent server'));
    }
    return cb();
  }
}

function extractKeys(req) {
  const keys = {};
  Object.keys(req.body).some(function (key) {
    if (key === 'args') {
      var args = req.body[key];
      // extract (and remove) key and secret from args if present
      for (var arg = args.shift(); arg; arg = args.shift()) {
        if (arg === '--key')
          keys['key'] = args.shift();
        else if (arg === '--secret')
          keys['secret'] = args.shift();
        else
          args.push(arg);
      }
      return true;
    }
  });
  return keys;
};

// use to close down the current agent connections
function close(cb) {
  if (!server) {
    console.log('edgemicro - nothing running to close');
    return cb();
  }
  server.close();
  cb()
}
// use to start edgemicro instance with key and secret
function start(args, cb) {
  if (!server) {
    return cb(new Error('edgemicro - no agent running, cannot start'));
  }
  if (args.key && args.secret) {
    const keys = {key: args.key, secret: args.secret};
    edgeConfig.get({source: defaultConfigSource, target: null, keys: args}, function (err, conf) {
      if (err) {
        console.error(err);
        return process.exit(1);
      }
      conf.keys = keys;
      proc.startImmediate(conf, (err) => {
        if (err) {
          return console.error(err);
        }
        networkConfig = conf; // save initialConfig to global constiable
        cb(err, conf);
      });
    });
  } else {
    cb(new Error('edgemicro - start needs EDGEMICRO_KEY and EDGEMICRO_SECRET'));
  }
}

const getDefaultConfig = function getConfig(){
  return edgeConfig.load({source:'./config/default.yaml'})
};

module.exports = {
  init: init,
  close: close,
  start: start,
  getDefaultConfig:getDefaultConfig
};
// accessor for agent config
Object.defineProperty(module.exports, 'config', {
  get: function () {
    return networkConfig;
  }
});
