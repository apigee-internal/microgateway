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

var analyticsMiddleware;
var analyticsCount = 0;//count calls to analytics
describe('test-cli', function() {
  const config = edgeConfig.load({ source: configLocations.getDefaultPath() })
  const target = "http://localhost:" + config.edgemicro.port + "/hello";
  restServer.listen(3000);
  before(function(done) {
    this.timeout(10000)
    configure.configure({ username: user, password: password, org: org, env: env, error:(msg)=>{done(msg)} }, () => {
      // initialize agent
      agent.start({ key: key, secret: secret, org: org, env: env },(err,s)=>{
        const server = s.gatewayServer;
        //find analytics plugin and stub it, so you can prove it is counted against
        if(server && server.plugins && server.plugins.length){
          const plugin = server.plugins.find((plugin)=>{
            return plugin.id === "analytics";
          });
          if(plugin){
            const middleware = plugin.onrequest;
            analyticsMiddleware = plugin.onrequest = function(req,res,next){
              analyticsCount++;
              assert(_.isFunction(next) && next.length==2)
              assert(_.isObject(req) && req.reqUrl)
              assert(_.isObject(res) && !res.finished)
              middleware(req,res,next);
            };
          }
        }
        done(err);

      });

    });

  });
  after(function(done) {
    // close agent server before finishing
    restServer.close();
    done()
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
        assert(analyticsCount===20);
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

   it('key gen', function(done) {
    keyGen.generate({ org: org, env: env, username: user, password: password }, (err, result) => {
      assert(!err, err);
      assert(result, "no result");
      assert(result.key);
      assert(result.secret);
      assert(result.bootstrap)
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
