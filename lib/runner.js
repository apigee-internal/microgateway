'use strict';
const forever = require('forever-monitor');
const assert = require('assert');
const restify = require('restify');
const edgeConfig = require('microgateway-config');
const _ = require('lodash');

var child;
module.exports =  function start(options,source,target){

  assert(options,'options must be present');
  assert(options.key,'env must have EDGEMICRO_KEY');
  assert(options.secret,'env must have EDGEMICRO_SECRET');

  const config = edgeConfig.load({source:source});

  const env = {
    EDGEMICRO_KEY:options.key,
    EDGEMICRO_SECRET:options.secret,
    EDGEMICRO_PORT:options.port,
    EDGEMICRO_TARGET:options.target,
    SOURCE_CONFIG_PATH:source,
    TARGET_CONFIG_PATH:target
  };
  
  const max = config.agent && config.agent.max_times ? config.agent.max_times : 50;
  child = new (forever.Monitor)('./lib/server.js', {
    max: max,
    env: env
  });

  child.on('exit', function () {
    console.error('server has exited after 3 restarts');
  });

  startRest(config,child);

  child.start();
};

const startRest = function startRest(config,child){
  var server = restify.createServer({});

  server.use(restify.gzipResponse());
  server.use(restify.bodyParser());

  server.post('/stop', (req,res,next)=>{
    child.stop();
    res.json(200,{'status':'stopped'});
    next();
  });
  server.post('/start', (req,res,next)=>{
    if(!child.started) {
      child.start();
      res.json(200,{'status':'started'});
    }else{
      res.json(400,{'status':'already started'});
    }
    next();
  });

  const port = config.agent && config.agent.port ? config.agent.port : 9000;
  server.listen(port,(err)=>{
    err && console.error(err);

  });
}
