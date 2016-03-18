'use strict';
const assert = require('assert');
const request = require('request');
const url = require('url');
const os = require('os');
const agent = require('../lib/agent')();
const edgeConfig = require('microgateway-config');
const configPath = './tests/config.yaml';
const restServer = require('./server/hello/hello.js')();
describe('configured agent/server address', function() {
  var key, secret;
  const config = edgeConfig.load({ source: configPath });
  const port = 3303;
  const target = "http://localhost:" + config.edgemicro.port + "/echo/test";

  config.proxies[0].url = "http://localhost:" + port + "/";

  before(function(done) {
    restServer.listen(port)

    key = '7ef8d2c6d302a8db90981a5ae372e2fdceb156288538e528026bf43a4c4d67a7';
    assert(key, 'env EDGEMICRO_KEY not set');
    // to prevent agent from auto-starting an instance
    delete process.env['EDGEMICRO_KEY'];
    secret = '62dde466dccc8790d385ec3a1765127d094a00136e5397bb0a89f5b64bacc17d';
    assert(secret, 'env EDGEMICRO_SECRET not set');
    // to prevent agent from auto-starting an instance
    delete process.env['EDGEMICRO_SECRET'];
    // initialize agent
    agent.start({ key: key, secret: secret }, config, done);
  });
  after(function(done) {
    process.env['EDGEMICRO_KEY'] = key;
    process.env['EDGEMICRO_SECRET'] = secret;
    // close agent server before finishing
    restServer.close();
    agent.close(done);
  });
  beforeEach(function(done) {
    delete process.env['EDGEMICRO_KEY'];
    delete process.env['EDGEMICRO_SECRET'];
    done();
  });

  it('hit server', function(done) {
    request({
      method: 'GET',
      uri: target
    }, function(err, res, body) {
      assert(!err, err);
      assert.equal(res.statusCode, 200);
      done(err);
    });
  });


  it('fails to hit server', function(done) {
    agent.close();
    request({
      method: 'GET',
      uri: target
    }, function(err, res, body) {
      assert(err, 'must have err');
      assert.equal(err.code, "ECONNREFUSED");
      agent.start({ key: key, secret: secret }, config,done);
    });
  });

  it('fails to hit server, then starts', function(done) {
    this.timeout(5000000);
    agent.close();
    request({
      method: 'GET',
      uri: target
    }, function(err, res, body) {
      assert(err, 'must have err');
      assert.equal(err.code, "ECONNREFUSED");
      agent.start({ key: key, secret: secret }, config, () => {
        request({
          method: 'GET',
          uri: target
        }, function(err, res, body) {
          assert(!err, err);
          assert.equal(res.statusCode, 200);
          done(err);
        });
      });
    });
  });
});
