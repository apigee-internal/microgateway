'use strict';
var assert = require('assert');
var request = require('request');
var async = require('async');
var url = require('url');
describe('Edge config verification', function() {
  var key;
  var secret;
  var uid;
  var app = require('../lib/agent');
  var config = require('microgateway-config').load();
  var target = url.format({
    hostname: (config.agent.address || '127.0.0.1'),
    port: (config.agent.port || 9000),
    protocol: 'http',
    pathname: 'proc'
  });

  function pause(delay) {
    it('pause', function(done) {
      setTimeout(done, delay);
    });
  }
  before(function(done) {
    key = '7ef8d2c6d302a8db90981a5ae372e2fdceb156288538e528026bf43a4c4d67a7';
    assert(key, 'env EDGEMICRO_KEY not set');
    delete process.env['EDGEMICRO_KEY'];
    secret = '62dde466dccc8790d385ec3a1765127d094a00136e5397bb0a89f5b64bacc17d';
    assert(secret, 'env EDGEMICRO_SECRET not set');
    delete process.env['EDGEMICRO_SECRET'];
    app.init(function(err) {
      if (err) {
        return done(err);
      }
      app.start({
        key: key,
        secret: secret
      }, done);
    });
  });
  after(function(done) {
    process.env['EDGEMICRO_KEY'] = key;
    process.env['EDGEMICRO_SECRET'] = secret;
    request({
      method: 'GET',
      uri: target
    }, function(err, res, body) {
      console.log('after', body);
      if (err) {
        done(err);
      }
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
          app.close(done); // ignore err
        });
      } else {
        assert.equal(res.statusCode, 404);
        app.close(done);
      }
    });
  });
  beforeEach(function(done) {
    pause(2000);
    done();
  });
  it('should have a config', function(done) {
    assert(app.config);
    var config = app.getDefaultConfig();
    assert(config)
    done();
  });
  it('should verify analytics availability with 500 error', function(done) {
    request({
      method: 'POST',
      uri: app.config.analytics.uri,
      auth: {
        user: key,
        pass: secret
      }
    }, function(err, res, body) {
      if (err) {
        return done(err);
      }
      if (res.statusCode === 401) {
        return done(new Error(
          'Got 401 Unauthorized. Invalid key/secret credentials.'
        ));
      }
      assert.equal(res.statusCode, 500);
      done();
    });
  });
  it('should verify boostrap url availability', function(done) {
    request({
      method: 'GET',
      uri: config['edge_config'].bootstrap,
      auth: {
        user: key,
        pass: secret
      }
    }, function(err, res, body) {
      if (err) {
        return done(err);
      }
      if (res.statusCode === 401) {
        return done(new Error(
          'Got 401 Unauthorized. Invalid key/secret credentials.'
        ));
      }
      assert.equal(res.statusCode, 200);
      done();
    });
  });
  it('should verify jwt_public_key availability', function(done) {
    request({
      method: 'GET',
      uri: config['edge_config'].jwt_public_key
    }, function(err, res, body) {
      if (err) {
        return done(err);
      }
      assert.equal(res.statusCode, 200);
      done();
    });
  });
  it('should verify quota availability for configured products', function(
    done) {
    var prods = Object.keys(app.config.quota);
    async.each(prods, function(prod, cb) {
      request({
        method: 'POST',
        uri: app.config.quota[prod].uri,
        auth: {
          user: key,
          pass: secret
        }
      }, function(err, res, body) {
        if (err) {
          return cb(err);
        }
        if (res.statusCode === 401) {
          return cb(new Error(
            'Got 401 Unauthorized. Invalid key/secret credentials.'
          ));
        }
        assert.equal(res.statusCode, 200);
        cb(null);
      });
    }, function(err) {
      done(err);
    });
  });
  it('should verify that analytics works with synthetic payload', function(
    done) {
    var payload = {
      "client_received_start_timestamp": Date.now(),
      "client_received_end_timestamp": Date.now(),
      "recordType": "APIAnalytics",
      "apiproxy": "edgemicro_127",
      "request_uri": "http://127.0.0.1:8000/hello",
      "request_path": "/hello",
      "request_verb": "GET",
      "client_ip": "127.0.0.1",
      "useragent": "curl/7.43.0",
      "apiproxy_revision": "1",
      "response_status_code": 200,
      "client_sent_start_timestamp": Date.now(),
      "client_sent_end_timestamp": Date.now(),
      "developer_app": "52ec80e1-06b7-4db6-ac36-9c5842072603",
      "client_id": "6gClRCKp0UCOZ8o9Q5S7X88nI5hgizGQ",
      "api_product": "travel-app"
    };
    request({
        method: 'POST',
        uri: app.config.analytics.uri,
        auth: {
          user: key,
          pass: secret
        }
      }, function(err, res, body) {
        if (err) {
          return done(err);
        }
        if (res.statusCode === 401) {
          return done(new Error(
            'Got 401 Unauthorized. Invalid key/secret credentials.'
          ));
        }
        assert.equal(res.statusCode, 200);
        done();
      })
      .write(JSON.stringify(payload));
  });
});
