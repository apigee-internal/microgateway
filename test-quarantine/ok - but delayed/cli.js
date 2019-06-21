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


    // /*

    //TODO inject counting into plugins.  Need to figure out it works with new clustering
    it('hit server', function(done) {
        this.timeout(20000)
        token.getToken({
            org: org,
            env: env,
            id: tokenId,
            secret: tokenSecret
        }, (err, token) => {
            err && done(err);
            assert(token && token.token, "token came back empty " + JSON.stringify(token))

            //
            console.log(target);

            async.times(10, function(n, next) {
                request({
                    method: 'GET',
                    uri: target,
                    headers: {
                        "Authorization": "Bearer " + token.token
                    }
                }, function(err, res, body) {
                    assert(!err, err);
                    console.log(res.statusCode);

                    if ( res.statusCode !== 200 && res.statusCode !== 401 ) {
                        console.log(`received unsual status code ${res.statusCode}`)
                        assert(true);
                    } else {
                        assert((res.statusCode === 200) || (res.statusCode === 401));
                        next(err,res);
                    }
                });
            },(err,responses) => {
                assert(!err,err);
                done()
            })
        })
    });


    it('hit server no token', function(done) {
        this.timeout(10000)
        token.getToken({
            org: org,
            env: env,
            id: tokenId,
            secret: tokenSecret
        }, (err, token) => {
            err && done(err);
            assert(token && token.token, "token is came back empty " + JSON.stringify(token))
            async.times(20, function(n, next) {
                request({
                    method: 'GET',
                    uri: target,
                    headers: {
                        "Authorization": "Bearer " + "bad"
                    }
                }, function(err, res, body) {
                    assert(!err, err);
                    assert.equal(res.statusCode,401);
                    next(err,res);
                });
            },function(err,responses){
                assert(!err,err);
                done()
            })
        })

    });

    it('token verify token', function(done) {
        this.timeout(5000);
        token.getToken({
            org: org,
            env: env,
            id: tokenId,
            secret: tokenSecret
        }, (err, t) => {
            err && done(err);
            assert(t && t.token, "token came back empty " + JSON.stringify(t))
            const file = 'test-token.txt';
            const filePath = path.join(__dirname, file);

            try {
                
                fs.writeFileSync(filePath, t.token);
                token.verifyToken({ org: org, env: env, file: filePath }, (err,result) => {
                    if ( (err !== null) && (result !== undefined) ) {
                        assert(false);
                    } else {
                        assert(true);
                    }
                    fs.unlinkSync(filePath);
                    done();
                });    
 
                
            } catch(e) {
                 assert(!err, err);
            }
            
        })
    });

});



