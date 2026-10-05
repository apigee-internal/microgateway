'use strict'

const path = require('path');
const assert = require('assert');
const configlib = require('../index.js');
var proxyquire = require('proxyquire');
var mockRequestValid = require('./fixtures/mock-request-valid.js');
var mockRequestInvalidProducts = require('./fixtures/mock-request-invalid-products.js');
var mockRequestInvalidProxies = require('./fixtures/mock-request-invalid-proxies.js');
const keys = {
    key: 'mYt3sTk3Y',
    secret: 'mYt3sTs3Cr3T'
};

let configlibmockValid = proxyquire.load('../index.js', {
    './lib/network': proxyquire.load('../lib/network', {
        'postman-request': mockRequestValid
    })
});

let configlibmockInvalidProducts = proxyquire.load('../index.js', {
    './lib/network': proxyquire.load('../lib/network', {
        'postman-request': mockRequestInvalidProducts
    })
});


let configlibmockInvalidProxies = proxyquire.load('../index.js', {
    './lib/network': proxyquire.load('../lib/network', {
        'postman-request': mockRequestInvalidProxies
    })
});

// Construct the absolute path
const fixturePath = path.join(__dirname, 'fixtures', 'load-dummy-eval-test-config.yaml');

describe('config - get ', () => {
    it('gets product updates from server', done => {
        // Use the absolute path
        configlibmockValid.get({ source: fixturePath, keys: keys }, (err, config) => {
            assert(config.product_to_proxy.productOne);
            assert(config.product_to_proxy.productTwo);
            assert(config.product_to_proxy.productThree);
            done();
        });
    });

    it('displays error when receiving invalid JSON product info', (done) => {
        var saveErr = console.error;
        console.error = () => { }
        configlibmockInvalidProducts.get({ source: fixturePath, keys: keys }, (err, config) => {
            console.error = saveErr;
            assert.equal(err instanceof Error, true);
            assert.equal(err.message.includes('CRITICAL ERROR: error parsing downloaded product list'), true);
            done();
        });
    });

    it('displays error when receiving invalid JSON proxy info', (done) => {
        var saveErr = console.error;
        console.error = () => { }
        configlibmockInvalidProxies.get({ source: fixturePath, keys: keys }, (err, config) => {
            console.error = saveErr;
            assert.equal(err instanceof Error, true);
            done();
        });
    });

    it('gets extauth public key updates from server', done => {
        configlibmockValid.get({ source: fixturePath, keys: keys }, (err, config) => {
            assert(config.extauth.public_keys);
            done();
        });
    });

    it('applies tlsOptions.agentOptions without requestCert and preserves secureProtocol string', done => {
        const capturedOpts = [];
        const customMockRequest = {
            get: function (options, callback) {
                capturedOpts.push(options);
                return mockRequestValid.get(options, callback);
            }
        };
        const mockIo = {
            loadSync: function () {
                const cfg = require('../lib/io')().loadSync({ source: fixturePath });
                cfg.edge_config.tlsOptions = {
                    agentOptions: {
                        rejectUnauthorized: true,
                        secureProtocol: 'TLSv1_2_method',
                        ciphers: 'ECDHE-RSA-AES256-GCM-SHA384'
                    }
                };
                return cfg;
            },
            setConsoleLogger: function () {}
        };
        const networkLoader = proxyquire.load('../lib/network', {
            'postman-request': customMockRequest,
            './io': function () { return mockIo; }
        })();
        networkLoader.get({ source: fixturePath, keys: keys }, (err) => {
            assert.equal(err, null);
            assert(capturedOpts.length > 0);
            capturedOpts.forEach(opt => {
                assert.equal(opt.rejectUnauthorized, true);
                assert.equal(opt.secureProtocol, 'TLSv1_2_method');
                assert.equal(opt.ciphers, 'ECDHE-RSA-AES256-GCM-SHA384');
                assert.equal(opt.requestCert, undefined);
            });
            done();
        });
    });

    it('safely serializes localproxy fields in EDGEMICRO_LOCAL_PROXY mode without JSON injection', done => {
        process.env.EDGEMICRO_LOCAL_PROXY = '1';
        const localproxy = {
            apiProxyName: 'edgemicro_proxyOne',
            revision: '1',
            basePath: '/a","injected":"yes',
            targetEndpoint: 'http://localhost:8080/'
        };
        configlibmockValid.get({ source: fixturePath, keys: keys, localproxy: localproxy }, (err, config) => {
            delete process.env.EDGEMICRO_LOCAL_PROXY;
            assert.equal(err, null);
            assert.equal(config.proxies.length, 1);
            assert.equal(config.proxies[0].base_path, '/a","injected":"yes');
            assert.equal(config.proxies[0].injected, undefined);
            done();
        });
    });
});