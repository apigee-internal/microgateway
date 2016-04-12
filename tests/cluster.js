'use strict';
const assert = require('assert');
const request = require('request');
const url = require('url');
const os = require('os');
const agent = require('../cli/lib/gateway')();
const configure = require('../cli/lib/configure')();
const keyGen = require('../cli/lib/key-gen')();

const cert = require('../cli/lib/cert')();
const fs = require('fs')
const async = require('async')
const _ = require('lodash')
const path = require('path');
const configLocations = require('../config/locations');
const thisPath = path.normalize(__dirname);
const token = require('../cli/lib/token')();
const envVars = require('./env')
const edgeConfig = require('microgateway-config');
const restServer = require('./server/hello/hello.js')(true);

configLocations.homeDir = thisPath;
configLocations.defaultDir = thisPath;

const password = envVars.password;
const key = envVars.key;
const secret = envVars.secret;
const user = envVars.user;
const org = envVars.org;
const env = envVars.env;
const tokenSecret = envVars.tokenSecret;
const tokenId = envVars.tokenId;
var server;
var analyticsMiddleware;
var analyticsCount = 0;//count calls to analytics
describe('clustered', function() {
  configLocations.defaultDir =  "./tests/";
  const config = edgeConfig.load({ source: configLocations.getDefaultPath() })
  const target = "http://localhost:" + config.edgemicro.port + "/hello";
  before(function(done) {
    restServer.listen();

    this.timeout(10000)
    var agentCount = 0;
    configure.configure({ username: user, password: password, org: org, env: env, error:(msg)=>{done(msg)} }, () => {
      // initialize agent
      agent.start({ key: key, secret: secret, org: org, env: env,cluster:false,processes:2 },(err,s)=>{
        server = s;
        done(err);
      });

    });

  });
  after(function(done) {
    // close agent server before finishing
    restServer.close(()=>{
      server.close(done);
    });
  });

  it('hit server', function(done) {
    analyticsCount = 0;
    this.timeout(10000)
    token.getToken({
      org: org,
      env: env,
      id: tokenId,
      secret: tokenSecret
    }, (err, token) => {
      err && done(err);
      assert(token && token.token, "token is came back empty " + JSON.stringify(token))
      async.times(10, function(n, next) {
        request({
          method: 'GET',
          uri: target,
          headers: {
            "Authorization": "Bearer " + token.token
          }
        }, function(err, res, body) {
          assert(!err, err);
          assert.equal(res.statusCode, 200);
          next(err,res);
        });
      },function(err,responses){
        assert(!err,err);
        assert(analyticsCount===20);
        done()
      })
    })

  });




});
