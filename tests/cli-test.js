'use strict';
const assert = require('assert');
const request = require('request');
const url = require('url');
const os = require('os');
const agent = require('../bin/lib/gateway')();
const configure = require('../bin/lib/configure')();
const cert = require('../bin/lib/cert')();
const fs = require('fs')
const async = require('async')

const path = require('path');
const configLocations = require('../config/locations');
const thisPath = path.normalize(__dirname);
configLocations.homeDir = thisPath;
configLocations.defaultDir = thisPath;
const token = require('../bin/lib/token')();

const edgeConfig = require('microgateway-config');
const restServer = require('./server/hello/hello.js')(true);
const password = process.env.MOCHA_PASSWORD;
const key = process.env.MOCHA_KEY;
const secret = process.env.MOCHA_SECRET;
const user = process.env.MOCHA_USER;
const org = process.env.MOCHA_ORG;
const env = process.env.MOCHA_ENV;
const tokenSecret = process.env.MOCHA_TOKEN_SECRET;
const tokenId = process.env.MOCHA_TOKEN_ID;

describe('test-cli', function() {
  const config = edgeConfig.load({ source: configLocations.getDefaultPath() })
  const target = "http://localhost:" + config.edgemicro.port + "/hello";
  restServer.listen(3000);
  before(function(done) {
    this.timeout(10000)
    configure.configure({ username: user, password: password, org: org, env: env }, () => {
      // initialize agent
      agent.start({ key: key, secret: secret, org: org, env: env });
      setTimeout(done, 500)
    });

  });
  after(function(done) {
    // close agent server before finishing
    restServer.close();
    done()
  });

  it('hit server', function(done) {
    this.timeout(10000)
    token.getToken({
      org: org,
      env: env,
      id: tokenId,
      secret: tokenSecret
    }, (err, token) => {
      err && done(err);
      assert(token && token.token, "token is came back empty " + JSON.stringify(token))
      async.times(20, function(n, next) {
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
        done()
      })
    })

  });

 it('hit server no token', function(done) {
    this.timeout(10000)
    token.getToken({
      org: org,
      env: env,
      id: tokenId,
      secret: tokenSecret
    }, (err, token) => {
      err && done(err);
      assert(token && token.token, "token is came back empty " + JSON.stringify(token))
      async.times(20, function(n, next) {
        request({
          method: 'GET',
          uri: target,
          headers: {
            "Authorization": "Bearer " + "bad"
          }
        }, function(err, res, body) {
          assert(!err, err);
          assert.equal(res.statusCode,401);
          next(err,res);
        });
      },function(err,responses){
        assert(!err,err);
        done()
      })
    })

  });
  it('test check cert', function(done) {
    const options = { org: org, env: env, username: user, password: password };
    cert.deleteCert(options, (err) => {
      assert(!err, err);
      cert.installCert(options, (err, res) => {
        assert(!err, err);
        assert(res, "res was empty")
        assert(res.startsWith("-----BEGIN CERTIFICATE-----"))
        assert(res.endsWith("-----END CERTIFICATE-----"))
        cert.checkCert(options, (err, res) => {
          assert(!err, err);
          assert(res, "res was empty")
          assert(res.startsWith('[ "private_key", "public_key" ]'))
          done();
        })
      })
    })
  });

  it('test cert', function(done) {
    cert.retrievePublicKey({ org: org, env: env, username: user, password: password }, (err, certificate) => {
      assert(!err, err);
      assert(certificate, "no certificate");

      done();
    })
  });

  const dir = __dirname;
  it('verify token', function(done) {
    token.getToken({
      org: org,
      env: env,
      id: tokenId,
      secret: tokenSecret
    }, (err, t) => {
      err && done(err);
      assert(t && t.token, "token is came back empty " + JSON.stringify(t))
      const file = 'test-token.txt';
      const filePath = path.join(dir, file);

      fs.writeFile(filePath, t.token, (err) => {
        assert(!err, err);
        const filePath = path.join(dir, file);
        token.verifyToken({ org: org, env: env, file: filePath }, (err) => {
          assert(!err, err);
          fs.unlinkSync(filePath);
          done();
        });
      })
    })

  });
});
