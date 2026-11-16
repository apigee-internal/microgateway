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

  describe('path canonicalization and target-prefix confinement (b/585273566, b/585274294)', () => {
    const sendRawRequest = (rawPath, headers) => new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: gatewayPort,
        method: 'GET',
        path: rawPath,
        headers: headers || {}
      }, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => resolve({ statusCode: res.statusCode, body }));
      });
      req.on('error', reject);
      req.end();
    });

    it('blocks target-prefix escapes and excludeUrls auth bypasses while preserving encoded slugs', async () => {
      const backendHits = [];
      const seenPluginPaths = [];

      server = http.createServer((req, res) => {
        backendHits.push(req.url);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ backendUrl: req.url }));
      });

      await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));

      const securityConfig = {
        edgemicro: {
          port: gatewayPort,
          logging: { level: 'error', dir: './tests/log' },
          plugins: {}
        },
        oauth: {
          excludeUrls: '/api/public/*,/api/*/status,*/open-probe,/health*'
        },
        proxies: [
          { name: 'api-proxy', base_path: '/api', secure: false, url: 'http://127.0.0.1:' + port + '/tenantA' },
          { name: 'api-admin-proxy', base_path: '/api/admin', secure: false, url: 'http://127.0.0.1:' + port + '/adminSvc' },
          { name: 'single-wild', base_path: '/sw/*', secure: false, url: 'http://127.0.0.1:' + port + '/swTarget' },
          { name: 'pub-root', base_path: '/pubroot', secure: false, url: 'http://127.0.0.1:' + port },
          { name: 'wild-proxy', base_path: '/wild/**/items', secure: false, url: 'http://127.0.0.1:' + port + '/wildTarget' }
        ]
      };

      gateway = gatewayService(securityConfig);
      gateway.addPlugin('oauth', () => ({
        onrequest: (req, res, next) => {
          seenPluginPaths.push({ url: req.url, reqUrlPath: req.reqUrl && req.reqUrl.path });
          if (req.headers['x-auth'] === 'valid') {
            return next();
          }
          res.statusCode = 401;
          res.end('DENIED');
          return next(true);
        }
      }));

      await new Promise((resolve, reject) => gateway.start((err) => (err ? reject(err) : resolve())));

      // 1. Target-prefix, root, single-wildcard, and cross-proxy base_path escapes must return 400 and never reach backend
      const invalidPaths = [
        '/..',
        '/%2e%2e',
        '/api/public/../../tenantB/secret',
        '/api/public/%2e%2e/%2e%2e/tenantB/secret',
        '/api/../tenantA-evil/secret',
        '/api/../api/private',
        '/api/v1/../admin/users',
        '/sw/%2e%2e/api/public/ok',
        '/api/..%2f..%2ftenantB/secret',
        '/api/%2e%2e%2ftenantB/secret',
        '/api/public%2f..%2fprivate',
        '/api/..;/tenantB/secret',
        '/api/%2e%2e%3b/tenantB/secret',
        '/api/..\\tenantB\\secret',
        '/api/%5c../tenantB/secret',
        '/api/..%5ctenantB/secret',
        '/api/..',
        '/api/%2e%2e',
        '/pubroot/../admin',
        '/wild/foo/items/../../admin',
        '/api//admin/status',
        '/api/\\admin/status',
        '//a@b'
      ];

      for (const badPath of invalidPaths) {
        const res = await sendRawRequest(badPath, { 'x-auth': 'valid' });
        assert.strictEqual(res.statusCode, 400, `Expected 400 for ${badPath}, got ${res.statusCode}`);
      }
      const wildMismatch = await sendRawRequest('/wild/foo/../../admin/items/secret', { 'x-auth': 'valid' });
      assert.ok(wildMismatch.statusCode === 400 || wildMismatch.statusCode === 404, `Expected 400/404, got ${wildMismatch.statusCode}`);
      assert.strictEqual(backendHits.length, 0, 'No invalid traversal request should reach backend');

      // 2. In-bounds traversal, #fragment, absolute-form URI, and // collapse must require auth (401)
      const authRequiredProbes = [
        '/api/private',
        '/api/public/../private',
        '/api/public/%2e%2e/private',
        '/api/private#/open-probe',
        'http://open-probe/api/private',
        '/api//status',
        '/api/\\/status',
        '//health@x/api/private'
      ];
      for (const probe of authRequiredProbes) {
        const res = await sendRawRequest(probe);
        assert.strictEqual(res.statusCode, 401, `Expected 401 for ${probe}, got ${res.statusCode}`);
      }
      assert.strictEqual(backendHits.length, 0, 'Unauthenticated bypass probes must be stopped by oauth');

      // 3. Authenticated in-bounds dot-segment normalizes both req.url/reqUrl.path and backend targetPath
      seenPluginPaths.length = 0;
      const authNormalized = await sendRawRequest('/api/public/../private?k=1', { 'x-auth': 'valid' });
      assert.strictEqual(authNormalized.statusCode, 200);
      assert.deepStrictEqual(JSON.parse(authNormalized.body), { backendUrl: '/tenantA/private?k=1' });
      assert.deepStrictEqual(seenPluginPaths[0], { url: '/api/private?k=1', reqUrlPath: '/api/private?k=1' });

      // 4. Non-regression: legitimate public wildcard, .well-known, %2F slugs, and non-dot %5C slugs work untouched
      const okPublic = await sendRawRequest('/api/public/ok?x=2');
      assert.strictEqual(okPublic.statusCode, 200);
      assert.deepStrictEqual(JSON.parse(okPublic.body), { backendUrl: '/tenantA/public/ok?x=2' });

      const okPublicDoubleSlash = await sendRawRequest('/api/public//ok?x=2');
      assert.strictEqual(okPublicDoubleSlash.statusCode, 200);
      assert.deepStrictEqual(JSON.parse(okPublicDoubleSlash.body), { backendUrl: '/tenantA/public/ok?x=2' });

      const okPublicInboundsDot = await sendRawRequest('/api/public/assets/../logo.png');
      assert.strictEqual(okPublicInboundsDot.statusCode, 200);
      assert.deepStrictEqual(JSON.parse(okPublicInboundsDot.body), { backendUrl: '/tenantA/public/logo.png' });

      const okEncodedSlug = await sendRawRequest('/api/public/projects/org%2Frepo/issues');
      assert.strictEqual(okEncodedSlug.statusCode, 200);
      assert.deepStrictEqual(JSON.parse(okEncodedSlug.body), { backendUrl: '/tenantA/public/projects/org%2Frepo/issues' });

      const okEncodedCallbackUrl = await sendRawRequest('/api/public/redirect/https%3A%2F%2Fexample.com%2Fcb');
      assert.strictEqual(okEncodedCallbackUrl.statusCode, 200);
      assert.deepStrictEqual(JSON.parse(okEncodedCallbackUrl.body), { backendUrl: '/tenantA/public/redirect/https%3A%2F%2Fexample.com%2Fcb' });

      const okEncodedBackslashSlug = await sendRawRequest('/api/public/users/CORP%5Calice');
      assert.strictEqual(okEncodedBackslashSlug.statusCode, 200);
      assert.deepStrictEqual(JSON.parse(okEncodedBackslashSlug.body), { backendUrl: '/tenantA/public/users/CORP%5Calice' });

      const okRawBackslashSlug = await sendRawRequest('/api/public/users/CORP\\alice');
      assert.strictEqual(okRawBackslashSlug.statusCode, 200);
      assert.deepStrictEqual(JSON.parse(okRawBackslashSlug.body), { backendUrl: '/tenantA/public/users/CORP/alice' });

      const okEncodedDotFile = await sendRawRequest('/api/public/files/dir%2F.gitignore');
      assert.strictEqual(okEncodedDotFile.statusCode, 200);
      assert.deepStrictEqual(JSON.parse(okEncodedDotFile.body), { backendUrl: '/tenantA/public/files/dir%2F.gitignore' });

      const okWellKnown = await sendRawRequest('/api/public/.well-known/openid-configuration');
      assert.strictEqual(okWellKnown.statusCode, 200);
      assert.deepStrictEqual(JSON.parse(okWellKnown.body), { backendUrl: '/tenantA/public/.well-known/openid-configuration' });

      const okInboundsWithEncodedSlug = await sendRawRequest('/api/a/../projects/org%2Frepo', { 'x-auth': 'valid' });
      assert.strictEqual(okInboundsWithEncodedSlug.statusCode, 200);
      assert.deepStrictEqual(JSON.parse(okInboundsWithEncodedSlug.body), { backendUrl: '/tenantA/projects/org%2Frepo' });
    });
  })
})