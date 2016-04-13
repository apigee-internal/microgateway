'use strict';

const assert = require('assert');
const async = require('async');
const request = require('request');
const envVars = require('../tests/env')
const token = require('../cli/lib/token')();
const edgeConfig = require('microgateway-config');
const restServer = require('../tests/server/hello/hello.js')(true);
const configLocations = require('../config/locations');
const configure = require('../cli/lib/configure')();
const agent = require('../cli/lib/gateway')();

const password = envVars.password;
const key = envVars.key;
const secret = envVars.secret;
const user = envVars.user;
const org = envVars.org;
const env = envVars.env;
const tokenSecret = envVars.tokenSecret;
const tokenId = envVars.tokenId;
var server;
describe('test-cli', function () {
  configLocations.defaultDir = "./tests/";
  const config = edgeConfig.load({ source: configLocations.getDefaultPath() })
  const target = "http://localhost:" + config.edgemicro.port + "/hello";

  before(function (done) {
    this.timeout(400000);

    configure.configure({ username: user, password: password, org: org, env: env, error: (msg) => { done(msg) } }, () => {
      // initialize agent
      agent.start({ key: key, secret: secret, org: org, env: env, cluster: true, processes: 2 }, (err, s) => {
        server = s;
        setTimeout(function () {
          restServer.listen(3021);
          done(err);
        },5000)

      });

    });

  });
  after(function (done) {
    // close agent server before finishing
    restServer.close(() => {
      server.close(done)
    });
  });
  it('load test-ish', function(done)  {
    this.timeout(100000)
    token.getToken({
      org: org,
      env: env,
      id: tokenId,
      secret: tokenSecret
    }, (err, token) => {
      err && done(err);
      assert(token && token.token, "token is came back empty " + JSON.stringify(token))
      async.times(200, function (n, next) {
        request({
          method: 'GET',
          uri: target,
          headers: {
            "Authorization": "Bearer " + token.token
          }
        }, function (err, res, body) {
          assert(!err, err);
          assert.equal(res.statusCode, 401);
          next(err, res);
        });
      }, function (err, responses) {
        assert(!err, err);
        console.log('finished')
        done();
      })
    })
  })

});