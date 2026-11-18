'use strict';

const assert = require('assert');
const http = require('http');
const net = require('net');
const gateway = require('../index');
const AdminServer = require('../lib/admin-server');
const logging = require('../lib/logging');
const configService = require('../lib/config');

function makeHttpRequest(port, path, headers) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method: 'GET',
      headers: headers || {}
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('Security: metrics_record spoofing & AdminServer default bind (b/586645803, b/586644768)', function () {

  describe('b/586645803: client-supplied metrics_record header', function () {
    let backendServer;
    let backendPort;
    let deadPort;
    let lastBackendHeaders;
    let gwInstance;

    beforeEach(function (done) {
      lastBackendHeaders = null;
      backendServer = http.createServer((req, res) => {
        lastBackendHeaders = req.headers;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      });
      backendServer.listen(0, '127.0.0.1', () => {
        backendPort = backendServer.address().port;
        const probe = net.createServer();
        probe.listen(0, '127.0.0.1', () => {
          deadPort = probe.address().port;
          probe.close(() => done());
        });
      });
    });

    afterEach(function (done) {
      const closeBackend = () => backendServer.close(() => done());
      if (gwInstance) {
        gwInstance.stop(() => closeBackend());
        gwInstance = null;
      } else {
        closeBackend();
      }
    });

    function startTestGateway(targetPort, plugins, cb) {
      const cfg = {
        edgemicro: {
          port: 0,
          address: '127.0.0.1',
          logging: { level: 'error', dir: './tests/log' },
          plugins: {}
        },
        proxies: [
          {
            name: 'sec-test-proxy',
            base_path: '/v1',
            url: `http://127.0.0.1:${targetPort}`,
            revision: '1',
            max_connections: 100
          }
        ]
      };
      gwInstance = gateway(cfg);
      gwInstance.plugins = plugins;
      gwInstance.start((err, server) => {
        if (err) return cb(err);
        cb(null, server.address().port);
      });
    }

    it('does not crash on plugin, upstream, or response errors and still passes the header through unchanged', async function () {
      const failingPlugin = {
        id: 'auth-reject',
        onrequest: function (req, res, next) {
          if (req.headers['x-fail-preflow']) {
            res.statusCode = 401;
            return next(new Error('invalid token'));
          }
          next();
        },
        onresponse: function (req, res, next) {
          if (req.headers['x-fail-response']) {
            return next(new Error('postflow failure'));
          }
          next();
        }
      };

      const gwPort = await new Promise((resolve, reject) => {
        startTestGateway(backendPort, [failingPlugin], (err, p) => err ? reject(err) : resolve(p));
      });

      // Preflow plugin error with a spoofed string metrics_record
      const r1 = await makeHttpRequest(gwPort, '/v1/test', { 'metrics_record': 'spoofed', 'x-fail-preflow': '1' });
      assert(r1.statusCode >= 400);

      // onresponse plugin error with a spoofed string metrics_record
      const r2 = await makeHttpRequest(gwPort, '/v1/test', { 'Metrics_Record': 'spoofed', 'x-fail-response': '1' });
      assert.strictEqual(r2.statusCode, 500);

      // Success path: header forwarded to the backend exactly as before
      const r3 = await makeHttpRequest(gwPort, '/v1/test', { 'metrics_record': 'spoofed' });
      assert.strictEqual(r3.statusCode, 200);
      assert.strictEqual(lastBackendHeaders['metrics_record'], 'spoofed');

      await new Promise((resolve) => gwInstance.stop(() => resolve()));
      gwInstance = null;

      // Upstream ECONNREFUSED with a spoofed string metrics_record
      const deadGwPort = await new Promise((resolve, reject) => {
        startTestGateway(deadPort, [], (err, p) => err ? reject(err) : resolve(p));
      });
      const r4 = await makeHttpRequest(deadGwPort, '/v1/test', { 'metrics_record': 'spoofed' });
      assert.strictEqual(r4.statusCode, 502);
    });

    it('still emits the metrics plugin record on upstream failure', async function () {
      const sentMessages = [];
      const origSend = process.send;
      process.send = function (msg) { sentMessages.push(msg); };

      try {
        const fakeMetricsPlugin = {
          id: 'metrics',
          onrequest: function (req, res, next) {
            req.headers['metrics_record'] = {
              proxy_name: res.proxy.name,
              proxy_url: res.proxy.url,
              proxy_basepath: res.proxy.base_path,
              proxy_status_code: res.statusCode
            };
            next();
          }
        };

        const gwPort = await new Promise((resolve, reject) => {
          startTestGateway(deadPort, [fakeMetricsPlugin], (err, p) => err ? reject(err) : resolve(p));
        });

        const res = await makeHttpRequest(gwPort, '/v1/test', { 'metrics_record': 'overwritten-by-plugin' });
        assert.strictEqual(res.statusCode, 502);

        const metricsMsgs = sentMessages.filter((m) => m && m.type === 'metricsData');
        assert(metricsMsgs.length >= 1, 'expected metricsData IPC message');
        assert.strictEqual(metricsMsgs[0].data.proxy_name, 'sec-test-proxy');
        assert.strictEqual(metricsMsgs[0].data.proxy_status_code, 502);
      } finally {
        process.send = origSend;
      }
    });
  });

  describe('b/586644768: AdminServer default bind', function () {
    let admin;

    beforeEach(function () {
      configService.init({
        uid: 'test-admin-uid',
        edgemicro: {
          port: 8000,
          logging: { level: 'error', dir: './tests/log' }
        },
        proxies: [{ name: 'tenantA-proxy' }]
      });
      logging.init();
    });

    afterEach(function (done) {
      if (!admin) {
        return done();
      }
      admin.destroy();
      const server = admin.server;
      admin = null;
      server.close(() => done());
    });

    it('binds 127.0.0.1 when no address is configured and keeps the /stats schema unchanged', async function () {
      admin = new AdminServer(0, undefined, null, false);
      admin.setCacheConfig({ proxies: [{ name: 'tenantA-proxy' }] });
      admin.start();

      await new Promise((resolve, reject) => {
        admin.server.once('listening', resolve);
        admin.server.once('error', reject);
      });

      const addr = admin.server.address();
      assert.strictEqual(addr.address, '127.0.0.1');
      assert.strictEqual(addr.family, 'IPv4');

      admin.addMetricsRecord({
        proxy_name: 'tenantA-proxy',
        proxy_url: 'http://backend.example.com:8443/tenantA',
        proxy_basepath: '/tenantA',
        target_host: 'backend.example.com',
        target_url: 'http://backend.example.com:8443/tenantA/orders',
        target_sent_timestamp: 100,
        target_received_timestamp: 120,
        preflow_time: 5,
        postflow_time: 3,
        target_time: 20,
        proxy_time: 28,
        proxy_status_code: 200,
        target_status_code: 200
      });
      admin.updateCachedStatsResponse();

      const res = await makeHttpRequest(addr.port, '/stats');
      assert.strictEqual(res.statusCode, 200);
      const entry = JSON.parse(res.body)['tenantA-proxy'];
      assert.strictEqual(entry.name, 'tenantA-proxy');
      assert.strictEqual(entry.url, 'http://backend.example.com:8443/tenantA');
      assert.strictEqual(entry.path, '/tenantA');
      assert.strictEqual(entry.target_host, 'backend.example.com');
      assert.strictEqual(entry.target_url, 'http://backend.example.com:8443/tenantA/orders');
      assert.strictEqual(entry.count_proxy_total_req, 1);
      assert.strictEqual(entry.count_proxy_2xx, 1);
    });
  });
});
