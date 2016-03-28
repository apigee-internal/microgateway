'use strict';
const assert = require('assert');
const request = require('request');
const url = require('url');
const os = require('os');
const agent = require('../lib/server')();
const edgeConfig = require('microgateway-config');
const restServer = require('./server/hello/hello.js')();
const path = require('path');
const configure = require('../bin/lib/configure');
const token = require('../bin/lib/token');

const configLocations = require('../config/locations');
const thisPath = path.normalize(__dirname);
configLocations.homeDir = thisPath;
configLocations.defaultDir = thisPath;

describe('configured agent/server address', function() {
  const key = '7ef8d2c6d302a8db90981a5ae372e2fdceb156288538e528026bf43a4c4d67a7';
  const secret = '62dde466dccc8790d385ec3a1765127d094a00136e5397bb0a89f5b64bacc17d';
  const port = 3303;
  var target ;
  restServer.listen(port)

  const keys = { key: key, secret: secret };
  var config;
  before(function(done) {
    this.timeout(400000);
    configure({ username: 'sfeldman+micro@apigee.com', password: 'P@ssw0rd1', org: 'sfeldmanmicro', env: 'test' }, () => {
      edgeConfig.get({ keys: keys, source: configLocations.getSourcePath('sfeldmanmicro', 'test') }, (err, configDownload) => {
        config = configDownload;
        delete config.edgemicro.plugins
        config.proxies[0].url = "http://localhost:" + port + "/";
        target = "http://localhost:" + config.edgemicro.port + "/hello/";
        agent.start(keys, config, done);
        config = configDownload;
      });

    });
  });
  after(function(done) {
    // close agent server before finishing
    restServer.close();
    agent.close(done);
  });
  beforeEach(function(done) {
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
      agent.start({ key: key, secret: secret }, config, done);
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
