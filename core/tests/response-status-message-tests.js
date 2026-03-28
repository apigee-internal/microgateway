'use strict'

const _ = require('lodash')
const assert = require('assert')
const gatewayService = require('../index')
const request = require('request')
const http = require('http')
const should = require('should')
const fs = require('fs');

const gatewayPort = 8800
const port = 3300

var gateway
var server

const startGateway = (config, handler, done) => {

  server = http.createServer(handler);

  server.listen(port, function() {
    console.log('API Server listening at %s', JSON.stringify(server.address()))

    gateway = gatewayService(config)

    done()
  })
}

describe('test target response status message', () => {
  afterEach((done) => {
    if (gateway) {
      gateway.stop(() => {})
    }

    if (server) {
      server.close()
    }

    done()
  })

  describe('target', () => {
    describe('response', () => {
      it('can have a custom status message that will be set.', (done) => {
        
        const baseConfig = {
          edgemicro: {
            port: gatewayPort,
            logging: { level: 'info', dir: './tests/log' },
            request_timeout: 1
          },
          proxies: [
            { base_path: '/v1', secure: false, url: 'http://localhost:' + port }
          ]
        }

        startGateway(baseConfig, (req, res) => {
          assert.equal('localhost:' + port, req.headers.host)
          res.writeHead(200, 'What a great message for a great request!')
          res.end('OK')
        }, () => {
          gateway.start((err) => {
            assert.ok(!err, err)

            request({
              method: 'GET',
              url: 'http://localhost:' + gatewayPort + '/v1'
            }, (err, r, body) => {
              assert.ok(!err, err)
              assert.equal(r.statusCode, 200)
              assert.equal(r.statusMessage, 'What a great message for a great request!')
              done()
            })
          })
        })
      })
    })
  })
})
