'use strict'

const path = require('path');
const assert = require('assert');
var proxyquire = require('proxyquire');
var mockRequestTls = require('./fixtures/mock-request-tls.js');
const keys = {
    key: 'mYt3sTk3Y',
    secret: 'mYt3sTs3Cr3T'
};

let configlibmockTls = proxyquire.load('../index.js', {
    './lib/network': proxyquire.load('../lib/network', {
        'request': mockRequestTls
    })
});

const fixturePathTls = path.join(__dirname, 'fixtures', 'load-dummy-eval-test-tls.yaml');

describe('config - tls rejectUnauthorized', () => {
    it('sets rejectUnauthorized to false if explicitly configured in tlsOptions', done => {
        configlibmockTls.get({ source: fixturePathTls, keys: keys }, (err, config) => {
            if (err) done(err);
            else {
                // If the mock received rejectUnauthorized: false, it returns successful mock data.
                assert(config.product_to_proxy.productOne);
                done();
            }
        });
    });
});
