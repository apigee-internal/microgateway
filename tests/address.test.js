'use strict';
var assert = require('assert');
var request = require('request');
var url = require('url');
var os = require('os');
describe('configured agent/server address', function() {
  var key, secret;
  var app = require('../lib/agent');
  var target;
  var saveEMAddress;
  var saveAgentAddress;
  var config = require('microgateway-config').load();
  before(function(done) {
    // config edgemicro and agent addresses from OS interfaces
    var interfaces = os.networkInterfaces();
    var addr;
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
    key = process.env['EDGEMICRO_KEY'];
    assert(key, 'env EDGEMICRO_KEY not set');
    // to prevent agent from auto-starting an instance
    delete process.env['EDGEMICRO_KEY'];
    secret = process.env['EDGEMICRO_SECRET'];
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
    app.init(done);
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
            console.log('stop', uid, err, body);
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
