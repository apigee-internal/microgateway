'use strict'

const _ = require('lodash')
const assert = require('assert')
const http = require('http')
const gatewayService = require('../index')
const request = require('postman-request')
const should = require('should')

const gatewayPort = 8800
const port = 3300
const baseConfig = {
  edgemicro: {
    port: gatewayPort,
    logging: { level: 'info', dir: './tests/log' }
  },
  proxies: [
    { base_path: '/v1', secure: false, url: 'http://localhost:' + port }
  ]
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
    gateway = gatewayService(config)

    // Signal that setup is complete
    done()
  })
}

describe('test configuration handling', () => {
  afterEach((done) => {
    if (gateway) {
      gateway.stop(() => { })
    }

    if (server) {
      server.close()
    }

    done()
  })

  describe('headers', () => {
    describe('host', () => {
      it('false (default value)', (done) => {
        startGateway(baseConfig, (req, res, next) => {
          console.log('localhost:' + port);
          console.log(req.headers.host);
          //
          assert.equal('localhost:' + port, req.headers.host)
          res.end('OK')
        }, () => {
          gateway.start((err) => {
            assert(!err, err)

            request({
              method: 'GET',
              url: 'http://localhost:' + gatewayPort + '/v1'
            }, (err, r, body) => {
              assert(!err, err)
              assert.equal('OK', body)
              done()
            })
          })
        })
      })

      it('true', (done) => {
        var config = _.cloneDeep(baseConfig)

        config.headers = {
          host: false
        }

        startGateway(config, (req, res, next) => {
          console.log(req.headers);
          assert.equal('localhost:' + gatewayPort, req.headers.host)
          res.end('OK')
        }, () => {
          gateway.start((err) => {
            assert(!err, err)

            request({
              method: 'GET',
              url: 'http://localhost:' + gatewayPort + '/v1'
            }, (err, r, body) => {
              assert(!err, err)
              assert.equal('OK', body)
              done()
            })
          })
        })
      })
    })
  })

  describe('proxy path matching and dot-segment traversal prevention', () => {
    const proxyPathMatcher = require('../lib/proxy-path-matcher');

    it('rejects sibling prefix extensions and dot-segment escapes in matchPath', () => {
      assert.strictEqual(proxyPathMatcher.matchPath('/lab', '/lab'), true);
      assert.strictEqual(proxyPathMatcher.matchPath('/lab/', '/lab'), true);
      assert.strictEqual(proxyPathMatcher.matchPath('/lab/normal', '/lab'), true);
      assert.strictEqual(proxyPathMatcher.matchPath('/lab/.well-known/openid-configuration', '/lab'), true);
      assert.strictEqual(proxyPathMatcher.matchPath('/lab/file..json', '/lab'), true);
      assert.strictEqual(proxyPathMatcher.matchPath('/lab/a/../normal', '/lab'), true);
      assert.strictEqual(proxyPathMatcher.matchPath('/lab/./normal', '/lab'), true);

      assert.strictEqual(proxyPathMatcher.matchPath('/labfoo', '/lab'), false);
      assert.strictEqual(proxyPathMatcher.matchPath('/lab/../admin', '/lab'), false);
      assert.strictEqual(proxyPathMatcher.matchPath('/lab/../../admin', '/lab'), false);
      assert.strictEqual(proxyPathMatcher.matchPath('/lab/%2e%2e/admin', '/lab'), false);
      assert.strictEqual(proxyPathMatcher.matchPath('/lab/a/../../admin', '/lab'), false);
      assert.strictEqual(proxyPathMatcher.normalizePath(null), null);
    });

    it('blocks dot-segment traversal escaping target prefix while preserving valid requests', (done) => {
      const seenBackendUrls = [];
      server = http.createServer((req, res) => {
        seenBackendUrls.push(req.url);
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('raw=' + req.url);
      });

      const traversalConfig = {
        edgemicro: {
          port: gatewayPort,
          logging: { level: 'info', dir: './tests/log' }
        },
        proxies: [
          { base_path: '/lab', secure: false, url: 'http://localhost:' + port + '/backend' }
        ]
      };

      const sendRawGet = (rawPath, cb) => {
        const req = http.request({
          hostname: 'localhost',
          port: gatewayPort,
          method: 'GET',
          path: rawPath
        }, (res) => {
          let data = '';
          res.on('data', chunk => { data += chunk; });
          res.on('end', () => cb(null, res.statusCode, data));
        });
        req.on('error', cb);
        req.end();
      };

      server.listen(port, '127.0.0.1', () => {
        gateway = gatewayService(traversalConfig);
        gateway.start((err) => {
          assert(!err, err);
          sendRawGet('/lab/../admin', (err1, status1) => {
            assert(!err1, err1);
            assert.strictEqual(status1, 404);
            sendRawGet('/lab/../../admin', (err2, status2) => {
              assert(!err2, err2);
              assert.strictEqual(status2, 404);
              sendRawGet('/lab/%2e%2e/admin', (err3, status3) => {
                assert(!err3, err3);
                assert.strictEqual(status3, 404);
                sendRawGet('/labfoo', (err4, status4) => {
                  assert(!err4, err4);
                  assert.strictEqual(status4, 404);
                  assert.strictEqual(seenBackendUrls.length, 0);
                  sendRawGet('/lab/normal?q=1', (err5, status5, body5) => {
                    assert(!err5, err5);
                    assert.strictEqual(status5, 200);
                    assert.strictEqual(body5, 'raw=/backend/normal?q=1');
                    sendRawGet('/lab/a/../normal?q=1', (err6, status6, body6) => {
                      assert(!err6, err6);
                      assert.strictEqual(status6, 200);
                      assert.strictEqual(body6, 'raw=/backend/normal?q=1');
                      done();
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  })
})