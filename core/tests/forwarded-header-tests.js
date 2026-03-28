'use strict'

const _ = require('lodash')
const assert = require('assert')
const http = require('http')
const gatewayService = require('../index')
const request = require('request')
const should = require('should')
const fs = require('fs');

const gatewayPort = 8800
const port = 3300
const baseConfig = {
  edgemicro: {
    port: gatewayPort,
    logging: { level: 'info', dir: './tests/log' },
  },
  proxies: [
    { base_path: '/v1', secure: false, url: 'http://localhost:' + port }
  ],
  headers: {
    "x-forwarded-for": true,
    "x-forwarded-host": true,
    "x-request-id": true,
    "x-response-time": true,
    "x-forwarded-proto": true,
    "via": true
  }
}

var gateway
var server

// Re-wrote startGateway to use native http module instead of restify
const startGateway = (config, handler, done) => {
  // Create a native http server
  server = http.createServer((req, res) => {
    // The original restify server was routing GET /
    // We add basic routing to mimic this for the test handlers.
    // The proxy config maps /v1 to / on this target server.
    if (req.method === 'GET' && req.url === '/') {

      // The test handler expects (req, res, next)
      // Native http provides (req, res)
      // We'll pass a dummy 'next' function since the handlers don't use it.
      const next = () => { };

      // Call the test handler
      handler(req, res, next);

    } else {
      // Respond 404 for any other requests
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  });

  // Start listening
  server.listen(port, function () {
    // Updated log message
    console.log('HTTP target server listening at http://localhost:%s', port);

    // Initialize the gateway service
    gateway = gatewayService(config);

    // Signal that setup is complete
    done();
  });
}

describe('test forwarding headers', () => {
  afterEach((done) => {
    if (gateway) {
      gateway.stop(() => { })
    }

    if (server) {
      server.close() // server.close() works for http.Server as well
    }

    done()
  })

  describe('config', () => {
    describe('headers', () => {
      it('will set forwarded headers when set to true', (done) => {
        startGateway(baseConfig, (req, res, next) => {
          const headers = req.headers;
          //Random header that is populated it's <uuid>.<uuid>
          assert.ok(headers["x-request-id"])
          //calculated headers
          const validForwardedIps = ["::ffff:127.0.0.1", "::1", "127.0.0.1"];
          assert.ok(validForwardedIps.includes(headers["x-forwarded-for"]),
            `x-forwarded-for header value is not one of the expected loopback IPs: ${validForwardedIps.join(', ')}. Actual: ${headers["x-forwarded-for"]}`);
          assert.equal(headers["x-forwarded-host"], "localhost:8800")
          assert.equal(headers["via"], "1.1 localhost")
          assert.equal('localhost:' + port, req.headers.host)
          res.end('OK')
        }, () => {
          gateway.start((err) => {
            assert.ok(!err)

            request({
              method: 'GET',
              url: 'http://localhost:' + gatewayPort + '/v1'
            }, (err, r, body) => {
              assert.ok(!err)
              assert.ok(r.headers["x-response-time"])
              assert.equal('OK', body)
              done()
            })
          })
        })
      })


      it('will not set forwarded headers when set to false', (done) => {
        var clonedConfig = _.clone(baseConfig)
        clonedConfig.headers["via"] = false;
        clonedConfig.headers["x-forwarded-for"] = false;
        clonedConfig.headers["x-request-id"] = false;
        clonedConfig.headers["x-forwarded-host"] = false;
        clonedConfig.headers["x-response-time"] = false;
        startGateway(clonedConfig, (req, res, next) => {
          const headers = req.headers;
          //Random header that is populated it's <uuid>.<uuid>
          assert.ok(!headers["x-request-id"])
          //calculated headers
          assert.ok(!headers["x-forwarded-for"])
          assert.ok(!headers["x-forwarded-host"])
          assert.ok(!headers["via"])
          assert.equal('localhost:' + port, req.headers.host)
          res.end('OK')
        }, () => {
          gateway.start((err) => {
            assert(!err, err)

            request({
              method: 'GET',
              url: 'http://localhost:' + gatewayPort + '/v1'
            }, (err, r, body) => {
              assert.ok(!err)
              assert.ok(!r.headers["x-response-time"])
              assert.equal('OK', body)
              done()
            })
          })
        })
      })


      it('will set x-forwarded-proto', (done) => {
        var clonedConfig = _.clone(baseConfig)
        clonedConfig.headers["x-forwarded-proto"] = true;
        startGateway(clonedConfig, (req, res, next) => {
          const headers = req.headers;
          assert.equal(headers["x-forwarded-proto"], "http")
          assert.equal('localhost:' + port, req.headers.host)
          res.end('OK')
        }, () => {
          gateway.start((err) => {
            assert(!err, err)

            request({
              method: 'GET',
              url: 'http://localhost:' + gatewayPort + '/v1'
            }, (err, r, body) => {
              assert.ok(!err)
              assert.equal('OK', body)
              done()
            })
          })
        })
      })

      it('will not set x-forwarded-proto if already set', (done) => {
        var clonedConfig = _.clone(baseConfig)
        clonedConfig.headers["x-forwarded-proto"] = true;
        startGateway(clonedConfig, (req, res, next) => {
          const headers = req.headers;
          assert.equal(headers["x-forwarded-proto"], "https")
          assert.equal('localhost:' + port, req.headers.host)
          res.end('OK')
        }, () => {
          gateway.start((err) => {
            assert(!err, err)

            request({
              method: 'GET',
              headers: {
                'x-forwarded-proto': 'https'
              },
              url: 'http://localhost:' + gatewayPort + '/v1'
            }, (err, r, body) => {
              assert.ok(!err)
              assert.equal('OK', body)
              done()
            })
          })
        })
      })


      it('will not set x-forwarded-proto', (done) => {
        var clonedConfig = _.clone(baseConfig)
        clonedConfig.headers["x-forwarded-proto"] = false;
        startGateway(clonedConfig, (req, res, next) => {
          const headers = req.headers;
          assert.ok(!headers["x-forwarded-proto"])
          assert.equal('localhost:' + port, req.headers.host)
          res.end('OK')
        }, () => {
          gateway.start((err) => {
            assert(!err, err)

            request({
              method: 'GET',
              url: 'http://localhost:' + gatewayPort + '/v1'
            }, (err, r, body) => {
              assert.ok(!err)
              assert.equal('OK', body)
              done()
            })
          })
        })
      })
    })
  })
})