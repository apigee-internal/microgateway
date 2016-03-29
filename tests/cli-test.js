'use strict';
const assert = require('assert');
const request = require('request');
const url = require('url');
const os = require('os');
const agent = require('../bin/lib/gateway')();
const configure = require('../bin/lib/configure')();
const path = require('path');
const configLocations = require('../config/locations');
const thisPath = path.normalize(__dirname);
configLocations.homeDir = thisPath;
configLocations.defaultDir = thisPath;
const token = require('../bin/lib/token');

const edgeConfig = require('microgateway-config');
const restServer = require('./server/hello/hello.js')(true);

describe('test-cli', function() {
  const key = '7ef8d2c6d302a8db90981a5ae372e2fdceb156288538e528026bf43a4c4d67a7';
  const secret = '62dde466dccc8790d385ec3a1765127d094a00136e5397bb0a89f5b64bacc17d';
  const config = edgeConfig.load({ source: configLocations.getDefaultPath() })
  const target = "http://localhost:" + config.edgemicro.port + "/hello";
  restServer.listen(3000);
  before(function(done) {
    this.timeout(10000)
    configure.configure({ username: 'sfeldman+micro@apigee.com', password: 'P@ssw0rd1', org: 'sfeldmanmicro', env: 'test' },()=>{
        // initialize agent
      agent.start({ key: key, secret: secret, org: 'sfeldmanmicro', env: 'test' });
      setTimeout(done, 500)
    });
  
  });
  after(function(done) {
    // close agent server before finishing
    restServer.close();
    done()
  });

  it('hit server', function(done) {
    token.getToken({
      org: 'sfeldmanmicro',
      env: 'test',
      id: 'AK8oYG53vyAgKKtvazNaiAs42xwqYkZ4',
      secret: 'DsOnAeAC9U4OGmg4'
    }, (err, token) => {
      err && done(err);
      assert(token && token.token, "token is came back empty "+JSON.stringify(token))
      request({
        method: 'GET',
        uri: target,
        headers: {
          "Authorization": "Bearer " + token.token
        }
      }, function(err, res, body) {
        assert(!err, err);
        assert.equal(res.statusCode, 200);
        done(err);
      });
    })

  });
});
