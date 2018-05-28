'use strict';
const assert = require('assert');
const request = require('request');
const url = require('url');
const os = require('os');
const agent = require('../lib/server')();
const edgeConfig = require('microgateway-config');
const restServer = require('./server/hello/hello.js')();
const path = require('path');
const configure = require('../cli/lib/configure')();
const token = require('../cli/lib/token')();
const envVars = require('./env');

const configLocations = require('../config/locations');
const thisPath = path.normalize(__dirname);
configLocations.homeDir = thisPath;
configLocations.defaultDir = thisPath;
const password = envVars.password;
const key = envVars.key;
const secret = envVars.secret;
const user = envVars.user;
const org = envVars.org;
const env = envVars.env;
describe('configured agent/server address', function() {
  const port = 3303;
  let target;
  restServer.listen(port);

  const keys = {key: key, secret: secret};
  let config;
  before(function(done) {
    this.timeout(400000);
    configure.configure({username: user, password: password, org: org, env: env, error: (msg)=>{
done(msg);
}}, () => {
      edgeConfig.get({keys: keys, source: configLocations.getSourcePath(org, env)}, (err, configDownload) => {
        config = configDownload;
        delete config.edgemicro.plugins;
        config.proxies[0].url = 'http://localhost:' + port + '/';
        target = 'http://localhost:' + config.edgemicro.port + '/edgemicro_hello/';
        agent.start(keys, null, config, done);
        config = configDownload;
      });
    });
  });
  after(function(done) {
    // close agent server before finishing
    restServer.close(()=>{
      agent.close(done);
    }); ;
  });
  beforeEach(function(done) {
    done();
  });

  it('hit server', function(done) {
    request({
      method: 'GET',
      uri: target,
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
      uri: target,
    }, function(err, res, body) {
      assert(err, 'must have err');
      assert.equal(err.code, 'ECONNREFUSED');
      agent.start({key: key, secret: secret}, null, config, done);
    });
  });

  it('fails to hit server, then starts', function(done) {
    this.timeout(5000000);
    agent.close();
    request({
      method: 'GET',
      uri: target,
    }, function(err, res, body) {
      assert(err, 'must have err');
      assert.equal(err.code, 'ECONNREFUSED');
      agent.start({key: key, secret: secret}, null, config, () => {
        request({
          method: 'GET',
          uri: target,
        }, function(err, res, body) {
          assert(!err, err);
          assert.equal(res.statusCode, 200);
          done(err);
        });
      });
    });
  });
});
