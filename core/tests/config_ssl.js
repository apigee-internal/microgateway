'use strict'

const _ = require('lodash')
const assert = require('assert')
const http = require('http')
const gatewayService = require('../index')
const request = require('request')
const should = require('should')
const fs = require('fs');
const path = require('path')

const gatewayPort = 8800
const port = 3300
const baseConfig = {
  edgemicro: {
    port: gatewayPort,
    logging: { level: 'info', dir: './tests/log' },
    ssl: {
      key: path.join(__dirname, 'server.key'),
      cert: path.join(__dirname, 'server.crt')
    }
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
    gateway = gatewayService(config);

    // Signal that setup is complete
    done();
  });
}

describe('test ssl configuration handling', () => {
  afterEach((done) => {
    if (gateway) {
      gateway.stop(() => { })
    }

    if (server) {
      server.close()
    }

    done()
  })

  describe('config', () => {
    describe('ssl', () => {
      it('can request against an ssl endpoint', (done) => {
        startGateway(baseConfig, (req, res, next) => {
          assert.equal('localhost:' + port, req.headers.host)
          res.end('OK')
        }, () => {
          gateway.start((err) => {
            assert(!err, err)
            request({
              method: 'GET',
              key: fs.readFileSync(path.join(__dirname, 'server.key')),
              cert: fs.readFileSync(path.join(__dirname, 'server.crt')),
              rejectUnauthorized: false,
              url: 'https://localhost:' + gatewayPort + '/v1'
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
})