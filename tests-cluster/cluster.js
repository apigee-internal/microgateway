'use strict';

const assert = require('assert');
const async = require('async');
const request = require('request');
const envVars = require('../tests/env')
const tokenService = require('../cli/lib/token')();
const restServer = require('../tests/server/hello/hello.js')(true);
const edgeConfig = require('microgateway-config');
const configLocations = require('../config/locations');
const org = envVars.org;
const env = envVars.env;
const tokenSecret = envVars.tokenSecret;
const tokenId = envVars.tokenId;
const config = edgeConfig.load({ source: configLocations.getDefaultPath() })
const target = "http://localhost:" + config.edgemicro.port + "/hello";
var count = 0;
var server, token;
describe('test-cli', function () {
  before(function (done) {
    this.timeout(400000);
    // initialize agent
    restServer.listen(3000);
    tokenService.getToken({
      org: org,
      env: env,
      id: tokenId,
      secret: tokenSecret
    }, function (err, res) {
      token = res;
      assert(token && token.token, "token is came back empty " + JSON.stringify(token))
      done(err);
    });

  });
  after(function (done) {
    // close agent server before finishing
    restServer.close(function () {
      done();
    });
  });
  it('load test-ish', function (done) {
    this.timeout(100000)
    count = 0;
    async.times(300, function (n, next) {
      request({
        method: 'GET',
        uri: target,
        headers: {
          "Authorization": "Bearer " + token.token
        }
      }, function (err, res, body) {
        assert(res, err);
        assert.equal(res.statusCode, 200, body);
        count ++;
        next(err, res);
      });
    }, function (err, responses) {
      assert(!err, err);
      console.log('finished with %s requests',count);
      done();
    })

  })

});