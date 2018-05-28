'use strict';

const assert = require('assert');
const async = require('async');
const request = require('request');
const envVars = require('../tests/env');
const tokenService = require('../cli/lib/token')();
const edgeConfig = require('microgateway-config');
const configLocations = require('../config/locations');
const org = envVars.org;
const env = envVars.env;
const tokenSecret = envVars.tokenSecret;
const tokenId = envVars.tokenId;
const config = edgeConfig.load({
    source: configLocations.getDefaultPath(),
});
const target = 'http://localhost:' + config.edgemicro.port + '/hello';
var count = 0;
var server, token;
describe('test-cli', function() {
    before(function(done) {
        this.timeout(5000);
        // initialize agent
        tokenService.getToken({
            org: org,
            env: env,
            id: tokenId,
            secret: tokenSecret,
        }, function(err, res) {
            token = res;
            assert(token && token.token, 'token is came back empty ' + JSON.stringify(token));
            done(err);
        });
    });

    it('load test-ish', function(done) {
        this.timeout(400 * 1000);
        count = 0;
        let not200count = 0;
        let now = Date.now();
        async.times(1000, function(n, next) {
            request({
                method: 'GET',
                uri: target,
                headers: {
                    'Authorization': 'Bearer ' + token.token,
                },
            }, function(err, res, body) {
                if (!err && res && res.statusCode == 200) {
                    count++;
                } else {
                    not200count++;
                }
                next();
            });
        }, function(err, responses) {
            console.log('finished with %s good requests %s bad requests', count, not200count);
            console.log('took %s', Date.now() - now);
            done();
        });
    });
});
