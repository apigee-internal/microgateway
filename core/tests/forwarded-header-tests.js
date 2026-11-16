'use strict'

const _ = require('lodash')
const assert = require('assert')
const http = require('http')
const gatewayService = require('../index')
const request = require('postman-request')
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

      it('strips RFC 7230 hop-by-hop and Connection-listed client headers while protecting gateway and plugin headers (b/585273839)', (done) => {
        const net = require('net');
        const clonedConfig = _.cloneDeep(baseConfig);
        clonedConfig.headers = {
          'x-forwarded-for': true,
          'x-forwarded-host': true,
          'x-request-id': true,
          'x-response-time': true,
          'x-forwarded-proto': true,
          'via': true
        };
        let capturedHeaders = null;

        server = http.createServer((req, res) => {
          capturedHeaders = req.headers;
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('OK');
        });

        server.listen(port, () => {
          gateway = gatewayService(clonedConfig);
          gateway.addPlugin('inject-auth', () => ({
            onrequest: (req, res, next) => {
              req.headers['x-authorization-claims'] = 'trusted-jwt';
              req.headers['x-api-key'] = 'trusted-key';
              next();
            }
          }));

          gateway.start((err) => {
            assert(!err, err);

            const rawReq = [
              'GET /v1 HTTP/1.1',
              'Host: localhost:' + gatewayPort,
              'Connection: keep-alive, x-hbh-custom, x-backend-auth, x-authorization-claims, x-api-key, x-forwarded-for, x-forwarded-proto, x-forwarded-host, x-request-id, via, host',
              'Keep-Alive: timeout=5, max=100',
              'Proxy-Authorization: Basic c2VjcmV0',
              'Proxy-Authenticate: Basic',
              'TE: trailers',
              'Trailer: x-trailer',
              'Upgrade: websocket',
              'x-hbh-custom: should-be-stripped',
              'x-backend-auth: should-be-stripped',
              'x-authorization-claims: attacker-spoofed',
              'x-legit-header: preserved-value',
              '',
              ''
            ].join('\r\n');

            const sock = net.connect(gatewayPort, 'localhost', () => {
              sock.write(rawReq);
            });

            let rawRes = '';
            let finished = false;
            sock.on('data', (chunk) => {
              rawRes += chunk.toString('utf8');
              if (!finished && rawRes.indexOf('0\r\n\r\n') !== -1) {
                finished = true;
                sock.destroy();
                try {
                  assert.ok(rawRes.startsWith('HTTP/1.1 200'));
                  assert.ok(capturedHeaders, 'backend should have received request');
                  assert.strictEqual(capturedHeaders['x-legit-header'], 'preserved-value');
                  assert.strictEqual(capturedHeaders['x-hbh-custom'], undefined);
                  assert.strictEqual(capturedHeaders['x-backend-auth'], undefined);
                  assert.strictEqual(capturedHeaders['keep-alive'], undefined);
                  assert.strictEqual(capturedHeaders['proxy-authorization'], 'Basic c2VjcmV0');
                  assert.strictEqual(capturedHeaders['proxy-authenticate'], 'Basic');
                  assert.strictEqual(capturedHeaders['te'], undefined);
                  assert.strictEqual(capturedHeaders['trailer'], undefined);
                  assert.strictEqual(capturedHeaders['upgrade'], undefined);
                  // Plugin-injected and gateway-injected headers must NOT be stripped by attacker Connection tokens
                  assert.strictEqual(capturedHeaders['x-authorization-claims'], 'trusted-jwt');
                  assert.strictEqual(capturedHeaders['x-api-key'], 'trusted-key');
                  assert.ok(capturedHeaders['x-forwarded-for']);
                  assert.strictEqual(capturedHeaders['x-forwarded-proto'], 'http');
                  assert.strictEqual(capturedHeaders['x-forwarded-host'], 'localhost:' + gatewayPort);
                  assert.ok(capturedHeaders['x-request-id']);
                  assert.strictEqual(capturedHeaders['via'], '1.1 localhost');
                  assert.strictEqual(capturedHeaders['host'], 'localhost:' + port);
                  if (capturedHeaders['connection']) {
                    assert.ok(
                      capturedHeaders['connection'] === 'keep-alive' || capturedHeaders['connection'] === 'close',
                      `Unexpected outbound connection header: ${capturedHeaders['connection']}`
                    );
                  }
                  done();
                } catch (assertErr) {
                  done(assertErr);
                }
              }
            });
            sock.on('error', done);
          });
        });
      })

      it('unconditionally strips Content-Length, blocks OPTIONS/TRACE smuggling on keep-alive sockets, and preserves DELETE framing (b/585273839)', async () => {
        const net = require('net');
        const clonedConfig = _.cloneDeep(baseConfig);
        const backendReceived = [];

        server = http.createServer((req, res) => {
          let reqBody = '';
          req.on('data', (c) => { reqBody += c.toString('utf8'); });
          req.on('end', () => {
            backendReceived.push({
              method: req.method,
              url: req.url,
              headers: req.headers,
              body: reqBody
            });
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('OK:' + req.method + ':' + req.url);
          });
        });

        await new Promise((resolve) => server.listen(port, resolve));
        const seenPluginFraming = [];
        gateway = gatewayService(clonedConfig);
        gateway.addPlugin('framing-spy-plugin', () => ({
          onrequest: (req, res, next) => {
            seenPluginFraming.push({
              te: req.headers['transfer-encoding'],
              cl: req.headers['content-length']
            });
            next();
          }
        }));
        await new Promise((resolve, reject) => gateway.start((err) => (err ? reject(err) : resolve())));

        const sendRawSocket = (payload) => new Promise((resolve, reject) => {
          const sock = net.connect(gatewayPort, 'localhost', () => sock.write(payload));
          let resp = '';
          let doneResp = false;
          const finish = () => {
            if (!doneResp) {
              doneResp = true;
              sock.destroy();
              resolve(resp);
            }
          };
          sock.on('data', (c) => {
            resp += c.toString('utf8');
            if (resp.includes('0\r\n\r\n') || (resp.startsWith('HTTP/1.0') && resp.includes('OK:'))) {
              finish();
            }
          });
          sock.on('end', finish);
          sock.on('close', finish);
          sock.on('error', reject);
        });

        // 1. HTTP/1.0 GET without Host header and with smuggled Content-Length
        const res10 = await sendRawSocket('GET /v1 HTTP/1.0\r\nContent-Length: 5\r\n\r\nhello');
        assert.ok(res10.includes('200 OK'), `Expected 200 OK for HTTP/1.0, got: ${res10}`);
        assert.strictEqual(backendReceived[0].headers['content-length'], undefined);
        assert.strictEqual(backendReceived[0].body, '');

        // 2. HTTP/1.1 GET with empty Host: header and smuggled Content-Length
        const resEmptyHost = await sendRawSocket(
          'GET /v1 HTTP/1.1\r\nHost: \r\nContent-Length: 5\r\nConnection: close\r\n\r\nhello'
        );
        assert.ok(resEmptyHost.includes('200 OK'), `Expected 200 OK for empty Host, got: ${resEmptyHost}`);
        assert.strictEqual(backendReceived[1].headers['content-length'], undefined);
        assert.strictEqual(backendReceived[1].headers['host'], 'localhost:' + port);

        // 3. OPTIONS and TRACE smuggling attempts must NOT inject second requests onto shared keep-alive socket
        const smuggledReq = 'GET /smuggled-admin HTTP/1.1\r\nHost: localhost\r\n\r\n';
        const resOptionsSmuggle = await sendRawSocket(
          'OPTIONS /v1 HTTP/1.1\r\nHost: localhost:' + gatewayPort + '\r\nContent-Length: ' + smuggledReq.length + '\r\nConnection: close\r\n\r\n' + smuggledReq
        );
        assert.ok(resOptionsSmuggle.includes('OK:OPTIONS:/'));
        assert.strictEqual(backendReceived[2].method, 'OPTIONS');
        assert.strictEqual(backendReceived[2].headers['transfer-encoding'], 'chunked');
        assert.strictEqual(backendReceived[2].body, smuggledReq);

        const resTraceSmuggle = await sendRawSocket(
          'TRACE /v1 HTTP/1.1\r\nHost: localhost:' + gatewayPort + '\r\nContent-Length: ' + smuggledReq.length + '\r\nConnection: close\r\n\r\n' + smuggledReq
        );
        assert.ok(resTraceSmuggle.includes('OK:TRACE:/'));
        assert.strictEqual(backendReceived[3].method, 'TRACE');
        assert.strictEqual(backendReceived[3].body, '');

        const resFollowUp = await sendRawSocket(
          'GET /v1/clean HTTP/1.1\r\nHost: localhost:' + gatewayPort + '\r\nConnection: close\r\n\r\n'
        );
        assert.ok(resFollowUp.includes('OK:GET:/clean'), `Follow-up request should not be poisoned, got: ${resFollowUp}`);
        assert.strictEqual(backendReceived.length, 5, 'Smuggled payload must never execute as an extra backend request');

        // 4. Non-regression: DELETE framing matches master (Content-Length: 0 and non-empty bodies are forwarded chunked)
        const resDeleteZero = await sendRawSocket(
          'DELETE /v1 HTTP/1.1\r\nHost: localhost:' + gatewayPort + '\r\nContent-Length: 0\r\nConnection: close\r\n\r\n'
        );
        assert.ok(resDeleteZero.includes('OK:DELETE:/'));
        assert.strictEqual(backendReceived[5].method, 'DELETE');
        assert.strictEqual(backendReceived[5].headers['transfer-encoding'], 'chunked');

        const resDeleteCL = await sendRawSocket(
          'DELETE /v1 HTTP/1.1\r\nHost: localhost:' + gatewayPort + '\r\nContent-Length: 11\r\nConnection: close\r\n\r\ndelete-body'
        );
        assert.ok(resDeleteCL.includes('OK:DELETE:/'));
        assert.strictEqual(backendReceived[6].method, 'DELETE');
        assert.strictEqual(backendReceived[6].headers['transfer-encoding'], 'chunked');
        assert.strictEqual(backendReceived[6].body, 'delete-body');
        assert.strictEqual(seenPluginFraming[6].cl, '11');

        const resDeleteChunked = await sendRawSocket(
          'DELETE /v1 HTTP/1.1\r\nHost: localhost:' + gatewayPort + '\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\nc\r\nchunked-body\r\n0\r\n\r\n'
        );
        assert.ok(resDeleteChunked.includes('OK:DELETE:/'));
        assert.strictEqual(backendReceived[7].method, 'DELETE');
        assert.strictEqual(backendReceived[7].headers['transfer-encoding'], 'chunked');
        assert.strictEqual(backendReceived[7].body, 'chunked-body');
        assert.strictEqual(seenPluginFraming[7].te, 'chunked');

        // 5. Non-regression: OPTIONS with Content-Length: 0 stays unframed, as on master
        const resOptionsZero = await sendRawSocket(
          'OPTIONS /v1 HTTP/1.1\r\nHost: localhost:' + gatewayPort + '\r\nContent-Length: 0\r\nConnection: close\r\n\r\n'
        );
        assert.ok(resOptionsZero.includes('OK:OPTIONS:/'));
        assert.strictEqual(backendReceived[8].headers['transfer-encoding'], undefined);
      })
    })
  })
})