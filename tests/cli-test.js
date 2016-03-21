'use strict';
const assert = require('assert');
const request = require('request');
const url = require('url');
const os = require('os');
const agent = require('../bin/lib/gateway');
const token = require('../bin/lib/token');

const edgeConfig = require('microgateway-config');
const configPath = './tests/default.yaml';
const targetConfigPath = './tests/cache-config.yaml';
const restServer = require('./server/hello/hello.js')(true);

describe('test-cli', function() {
  var key, secret;
  const config = edgeConfig.load({ source: configPath });
  const target = "http://localhost:" + config.edgemicro.port + "/hello";

  before(function(done) {
    this.timeout(2000)
    restServer.listen(3000);

    key = '7ef8d2c6d302a8db90981a5ae372e2fdceb156288538e528026bf43a4c4d67a7';
    secret = '62dde466dccc8790d385ec3a1765127d094a00136e5397bb0a89f5b64bacc17d';
    // initialize agent
    agent.start({ key: key, secret: secret, sourcePath:configPath, targetPath: targetConfigPath}, config);
    setTimeout(done,1000)
  });
  after(function(done) {
    // close agent server before finishing
    restServer.close();
    done()
  });

  it('hit server', function(done) {
    token.getToken({
      org:'sfeldmanmicro',
      env:'test',
      id:'AK8oYG53vyAgKKtvazNaiAs42xwqYkZ4',
      token:'DsOnAeAC9U4OGmg4',
      key:key,
      secret:secret
    },(err,token)=>{
      err && done(err);
      assert(token && token.token,"token is there")
      request({
        method: 'GET',
        uri: target,
        headers:{
          "Authorization":"Bearer "+token.token
        }
      }, function(err, res, body) {
        assert(!err, err);
        assert.equal(res.statusCode, 200);
        done(err);
      });
    })

  });
});
