'use strict';
const assert = require('assert');
const request = require('request');
const url = require('url');
const os = require('os');
const agent = require('../lib/agent');
const edgeConfig = require('microgateway-config');
const configPath = './tests/config.yaml';
const restServer = require('./server/hello/hello.js')();
describe('configured agent/server address', function() {
  var key, secret;
  var target;
  var saveEMAddress;
  var saveAgentAddress;
  var addr;
  const app = agent(configPath);
  const config = edgeConfig.load({source:configPath});
  const port = 3303;
  config.proxies[0].url= 'http://localhost:' + port;
  before(function(done) {
    restServer.listen(port)
    // config edgemicro and agent addresses from OS interfaces
    const interfaces = os.networkInterfaces();
    Object.keys(interfaces).some(function(inter, ndx, ni) {
      addr = interfaces[inter].find(function(obj) {
        return obj.family === 'IPv4';
      });
      if (addr) {
        return true;
      }
    });
    if (!addr) {
      return done(new Error(
        'need IPv4 address for configured address test'));
    }
    // already a configured address, save it and use a different one for tests
    if (!config.edgemicro.address) {
      config.edgemicro.address = addr.address;
      saveEMAddress = false;
    } else {
      saveEMAddress = true;
    }
    if (!config.agent.address) {
      config.agent.address = addr.address;
      saveAgentAddress = false;
    } else {
      saveAgentAddress = true;
    }
    key ='7ef8d2c6d302a8db90981a5ae372e2fdceb156288538e528026bf43a4c4d67a7';
    assert(key, 'env EDGEMICRO_KEY not set');
    // to prevent agent from auto-starting an instance
    delete process.env['EDGEMICRO_KEY'];
    secret = '62dde466dccc8790d385ec3a1765127d094a00136e5397bb0a89f5b64bacc17d';
    assert(secret, 'env EDGEMICRO_SECRET not set');
    // to prevent agent from auto-starting an instance
    delete process.env['EDGEMICRO_SECRET'];
    target = url.format({
      hostname: config.agent.address,
      port: config.agent.port || 9000,
      protocol: 'http',
      pathname: 'proc'
    });
    // initialize agent
    app.start({ key:key, secret:secret },done);
  });
  after(function(done) {
    process.env['EDGEMICRO_KEY'] = key;
    process.env['EDGEMICRO_SECRET'] = secret;
    if (!saveEMAddress) {
      delete config.edgemicro.address;
    }
    if (!saveAgentAddress) {
      delete config.agent.address;
    }
    // close agent server before finishing
    restServer.close();
    app.close(done);
  });
  beforeEach(function(done) {
    delete process.env['EDGEMICRO_KEY'];
    delete process.env['EDGEMICRO_SECRET'];
    done();
  });
  it('list is empty', function(done) {
      request({
        method: 'GET',
        uri: target
      }, function(err, res, body) {
        console.log('empty', body);
        if (body !== "Not Found") {
          request({
            method: 'PUT',
            uri: target,
            headers: {
              'content-type': 'application/json'
            },
            body: JSON.stringify({
              operation: 'stop'
            })
          }, function(err, res, body) {
            console.log('stop', err, body);
            app.close(done); // ignore err
          });
        }else {
          assert.equal(res.statusCode, 404);
          done(err);
        }
      });
    }),
    it('start hello', function(done) {
      request({
        method: 'POST',
        uri: target,
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          script: 'test/server/hello/hello.js',
          args: [
            '--key', key, '--secret', secret
          ]
        })
      }, function(err, res, body) {
        assert.equal(res.statusCode, 200);
        assert.ok(body);
        var proc = JSON.parse(body);
        assert.equal(proc.running, true);
        assert.ok(proc.since);
        done(err);
      });
    });
  it('hit server', function(done) {
      request({
        method: 'GET',
        uri: url.format({
          hostname: config.edgemicro.address,
          port: (config.edgemicro.port || 8000),
          protocol: 'http'
        })
      }, function(err, res, body) {
        assert(!err,err);
        assert.equal(res.statusCode, 404);
        done(err);
      });
    }),
    it('stop', function(done) {
      request({
        method: 'PUT',
        uri: target,
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          operation: 'stop'
        })
      }, function(err, res, body) {
        assert.equal(res.statusCode, 200);
        assert.ok(body);
        var proc = JSON.parse(body);
        assert.equal(proc.running, false); // is dead
        assert.ok(!proc.since);

        done(err);
      });
    });
});
