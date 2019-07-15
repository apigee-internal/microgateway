'use strict';
const assert = require('assert');
const request = require('request');
const url = require('url');
const util = require('util');
const denv = require('dotenv');
denv.config();
const agent = require('../cli/lib/gateway')();
const configure = require('../cli/lib/configure')();
const keyGen = require('../cli/lib/key-gen')();

const cert = require('../cli/lib/cert')();
const fs = require('fs')
const async = require('async')
const path = require('path');
const configLocations = require('../config/locations');
const thisPath = path.normalize(__dirname);
const token = require('../cli/lib/token')();


const envVars = require('./env')
const edgeConfig = require('microgateway-config');


const jwt = require('jsonwebtoken');


var until = require('test-until');


configLocations.homeDir = thisPath;
configLocations.defaultDir = thisPath;

const password = envVars.password;
const key = envVars.key;
const secret = envVars.secret;
const user = envVars.user;
const org = envVars.org;
const env = envVars.env;
const tokenSecret = envVars.tokenSecret;
const tokenId = envVars.tokenId;
const endpoint = envVars.endpoint;



const restServer = require('./server/hello/hello.js')(true);
//
var nextTest = false;
var promise = until(() => { return nextTest; })

//
const port = 3303;
var target ;
restServer.listen(port,() => {
    //
    console.log("Server is ready and listening");
    nextTest = true;
})


var server;

describe('test-cli', function() {
    //
    configLocations.defaultDir =  "./tests/";
    const config = edgeConfig.load({ source: configLocations.getDefaultPath() })
    const target = "http://localhost:" + config.edgemicro.port + (endpoint ? ('/' + endpoint) : '/edgemicro_hello');
    const keys = { key: key, secret: secret };

    before(function(done) {
        this.timeout(17000);

        promise.then(()=>{
            configure.configure({ username: user, password: password, org: org, env: env, error:(msg)=>{done(msg)} }, () => {
                // initialize agent


                agent.start({ key: key, secret: secret, org: org, env: env}, () => {
                    console.log("Starting tests");
                    setTimeout(() => done(), 5000);
                });

            });
        })

    });

    after(function(done) {
        // close agent server before finishing
        restServer.close(()=>{
            done();
            console.log("DONE WITH TESTING");
            agent.stop();
        });
    });


    this.beforeEach(function(done) {
        setTimeout(() => { done() },1000)
    })


    it('test check cert', function(done) {
        this.timeout(5000)
        const options = { org: org, env: env, username: user, password: password };
        cert.deleteCert(options, (err) => {
            assert(!err, err);
            cert.installCert(options, (err, res) => {
                assert(!err, err);
                assert(res, "res was empty")
                assert(res.startsWith("-----BEGIN CERTIFICATE-----"))
                assert(res.endsWith("-----END CERTIFICATE-----"))
                cert.checkCert(options, (err, res) => {
                    assert(!err, err);
                    assert(res, "res was empty");
                    //TODO
                    //  improve this logic.  needs to account for cps/non cps orgs and the
                    //  correspding cert apis response formats
                    done();
                })
            })
        })
    });

    //

    it('test cert', function(done) {
        cert.retrievePublicKey({ org: org, env: env, username: user, password: password }, (err, certificate) => {
            assert(!err, err);
            assert(certificate, "no certificate");

            done();
        })
    });

    it('test cert install error', function(done) {
        try {
            cert.installCert({ org: org, env: env, username: user, password: 'badPassword' }, (err, res) => {
                assert(err, "Did not error out with callback");
                done();
            });
        } catch (e) {
            done(e);
        }
    });

    it('test cert check error', function(done) {
        try {
            cert.checkCert({ org: org, env: env, username: user, password: 'badPassword' }, (err, res) => {
                assert(err, "Did not error out with callback");
                done();
            })
        } catch (e) {
            done(e);
        }
    });

    //

    it('test cert delete error', function(done) {
        try {
            cert.deleteCert({ org: org, env: env, username: user, password: 'badPassword' }, (err) => {
                assert(err, "Did not error out with callback");
                done();
            })
        } catch (e) {
            done(e);
        }
    });

    it('key gen', function(done) {
        keyGen.generate({ org: org, env: env, username: user, password: password }, (err, result) => {
            assert(!err, err);
            assert(result, "no result");
            assert(result.key);
            assert(result.secret);
            assert(result.bootstrap)
            done();
        })
    });

    //

});



