'use strict'

const _ = require('lodash')
const assert = require('assert')
const gatewayService = require('../index')
const request = require('request')
const https = require('https')
const should = require('should')
const fs = require('fs');
const path = require('path')

const gatewayPort = 8810
const port = 3310
const baseConfig = {
  edgemicro: {
    port: gatewayPort,
    logging: { level: 'info', dir: './tests/log' }
  },
  proxies: [
    { base_path: '/v1', secure: true, url: 'https://localhost:' + port }
  ],
  targets: [
    {
      host: 'localhost',
      ssl: {
        client: {
          cert: path.join(__dirname, 'server.crt'),
          key: path.join(__dirname, 'server.key'),
          rejectUnauthorized: false
        }
      }
    }
  ]
}

var gateway
var server

const startGateway = (config, handler, done) => {
  const opts = {
    key: fs.readFileSync(path.join(__dirname, 'server.key')),
    cert: fs.readFileSync(path.join(__dirname, 'server.crt'))
  };
  server = https.createServer(opts, handler);

  server.listen(port, function () {
    console.log('API Server listening at %s', JSON.stringify(server.address()))
    gateway = gatewayService(config)
    done()
  })
}

describe('test configuration handling TLS/SSL', () => {
  afterEach((done) => {
    if (gateway) {
      gateway.stop(() => { })
    }

    if (server) {
      server.close()
    }

    done()
  })

  describe('target', () => {
    describe('ssl', () => {
      it('ssl can be enabled between em and target', (done) => {
        startGateway(baseConfig, (req, res) => {
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
    })
  })
})
