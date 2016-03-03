'use strict';
var assert = require('assert');
var request = require('request');
var url = require('url');
describe('process lifecycle', function() {
  var key, secret;
  var uid;
  var app = require('../lib/agent');
  var config = require('microgateway-config').load();
  var target = url.format({
    hostname: config.agent.address || '127.0.0.1',
    port: config.agent.port || 9000,
    protocol: 'http',
    pathname: 'proc'
  });
  before(function(done) {
    key = process.env['EDGEMICRO_KEY'];
    assert(key, 'env EDGEMICRO_KEY not set');
    // to prevent agent from auto-starting an instance
    delete process.env['EDGEMICRO_KEY'];
    secret = process.env['EDGEMICRO_SECRET'];
    assert(secret, 'env EDGEMICRO_SECRET not set');
    // to prevent agent from auto-starting an instance
    delete process.env['EDGEMICRO_SECRET'];
    app.init(done);
  });
  after(function(done) {
    process.env['EDGEMICRO_KEY'] = key;
    process.env['EDGEMICRO_SECRET'] = secret;
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
        if (body) {
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
            done(); // ignore err
          });
        }
        assert.equal(res.statusCode, 404);
        done(err);
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
        console.log('start hello', body);
        assert.equal(res.statusCode, 200);
        assert.ok(body);
        var proc = JSON.parse(body);
        assert.equal(proc.running, true);
        assert.ok(proc.since);
        done(err);
      });
    }),
    it('list running', function(done) {
      request({
        method: 'GET',
        uri: target
      }, function(err, res, body) {
        console.log('list', err, body);
        assert.equal(res.statusCode, 200);
        assert.ok(body);
        var proc = JSON.parse(body);
        assert.equal(proc.running, true);
        assert.ok(proc.since);
        done(err);
      });
    }),
    it('restart', function(done) {
      request({
        method: 'PUT',
        uri: target,
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          operation: 'restart'
        })
      }, function(err, res, body) {
        console.log('restart', err, body);
        assert.equal(res.statusCode, 200);
        assert.ok(body);
        body = JSON.parse(body);
        assert.equal(body.running, true); // config should not have changed during this test
        assert.equal(body.configChanged, false); // config should not have changed during this test

        done(err);
      });
    }),
    it('get', function(done) {
      request({
        method: 'GET',
        uri: target
      }, function(err, res, body) {
        console.log('get', uid, err, body);
        assert.equal(res.statusCode, 200);
        assert.ok(body);
        var proc = JSON.parse(body);
        assert.equal(proc.running, true);
        assert.equal(proc.restarts, 1); // has been restarted once
        assert.ok(proc.since);
        done(err);
      });
    }),
    it('reload', function(done) {
      request({
        method: 'PUT',
        uri: target,
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          operation: 'reload'
        })
      }, function(err, res, body) {
        console.log('reload', err, body);
        assert.equal(res.statusCode, 200);
        body = JSON.parse(body);

        assert.equal(body.running, true); // config should not have changed during this test
        assert.equal(body.configChanged, true); // config should not have changed during this test
        done(err);
      });
    }),
    it('reload changed config', function(done) {
      app.config._hash = '1234567890abcdef'; // change hash value of config to force update
      request({
        method: 'PUT',
        uri: target,
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          operation: 'reload'
        })
      }, function(err, res, body) {
        console.log('reload', err, body);
        assert.equal(res.statusCode, 200);
        assert.ok(body);
        body = JSON.parse(body);

        assert.equal(body.running, true); // config should not have changed during this test
        assert.equal(body.configChanged, true); // config should not have changed during this test
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
        console.log('stop', uid, err, body);
        assert.equal(res.statusCode, 200);
        assert.ok(body);
        var proc = JSON.parse(body);

        assert.equal(proc.running, false); // is dead
        assert.ok(!proc.since);
        done(err);
      });
    }),
    it('introduce loopback and start', function(done) {
      app.config.proxies.push({
        max_connections: -1,
        name: 'edgemicro_loop',
        revision: '1',
        proxy_name: 'default',
        base_path: '/loopback',
        target_name: 'default',
        url: 'http://127.0.0.1:8000'
      });
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
        assert(!err,err)
        assert.equal(res.statusCode, 508);
        done(err);
      });
    });
});
