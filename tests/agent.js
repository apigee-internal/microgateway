'use strict';
const assert = require('assert');
const request = require('request');
const reqp = require('request-promise');
const url = require('url');
const http = require('http');
const os = require('os');
const denv = require('dotenv');
denv.config();
const agent = require('../lib/server')();
const edgeConfig = require('microgateway-config');
const path = require('path');
const configure = require('../cli/lib/configure')();
const token = require('../cli/lib/token')();

var until = require('test-until');

//conifiguration for tests...
const envVars = require('./env');
//
const configLocations = require('../config/locations');
const thisPath = path.normalize(__dirname);
configLocations.homeDir = thisPath;
configLocations.defaultDir = thisPath;
const password = envVars.password;
const key = envVars.key;
const secret = envVars.secret;
const user = envVars.user;
const org = envVars.org;
const env = envVars.env;
const endpoint = envVars.endpoint;
//

console.log('getSourcePath',configLocations.getSourcePath(org, env));


// use resitfy to create a server..
const restServer = require('./server/hello/hello.js')();

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

describe('configured agent/server address', () => {

    const keys = { key: key, secret: secret };
    var config;


    before(function(done) {

        this.timeout(400000);

        promise.then(()=>{
            //
            configure.configure({ username: user, password: password, org: org, env: env, error:(msg)=>{done(msg)}}, () => {
                //
                var srcPath = configLocations.getSourcePath(org, env)
                //
                edgeConfig.get({ keys: keys, source: srcPath }, (err, configDownload) => {
                    if ( err ) {
                        restServer.close(()=>{
                            agent.close(done);
                        });
                    } else {
                        config = configDownload;
                        if ( config ) {
                            if ( config.edgemicro ) delete config.edgemicro.plugins;
                            if ( config.proxies && config.proxies.length ) {
                                config.proxies[0].url = "http://localhost:" + port + "/";
                                config.proxies[0].base_path = (endpoint ? ('/' + endpoint) : '/edgemicro_hello');
                                target = "http://localhost:" + config.edgemicro.port + (endpoint ? ('/' + endpoint) : '/edgemicro_hello');
                                agent.start(keys, null, config, () => {
                                    console.log("Starting tests");
                                    done();
                                });
                            }
                        }
                    }
                });

            })

            //

        });
    });


    after(function(done) {
        // close agent server before finishing
        console.log("TEST DONE");
        restServer.close(()=>{
            agent.close(done);
        });
    });

    beforeEach(function(done) {
        setTimeout(() => {
            done();
        }, 1500);
    });

    it('hit server', function(done) {
        var nextIt = false;
        var promiseIt = until(() => { return nextIt; })
        var forwardErr = undefined;
        //
        console.log(target);
        //
        request({
            method: 'GET',
            uri: target
        }, function(err, res, body) {
            forwardErr = err;
            nextIt = true;
            assert(!err, err);
            assert.equal(res.statusCode, 200);

        });
        promiseIt.then(function() {
            done(forwardErr)
        })
    });

});
