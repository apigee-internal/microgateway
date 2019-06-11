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

/*
const restServer = require('./server/hello/hello.js')(true);
//
var nextTest = false;
var promise = until(() => { return nextTest; })

//
const port = 3303;

restServer.listen(port,() => {
    //
    console.log("Server is ready and listening");
    nextTest = true;
})

*/


var server;

//
configLocations.defaultDir =  "./tests/";
const config = edgeConfig.load({ source: configLocations.getDefaultPath() })
const target = "http://localhost:" + config.edgemicro.port + (endpoint ? ('/' + endpoint) : '/edgemicro_hello');
const keys = { key: key, secret: secret };

//
configure.configure({ username: user, password: password, org: org, env: env, error:(msg)=>{done(msg)} }, () => {
    // initialize agent
    agent.start({ key: key, secret: secret, org: org, env: env}, () => {
        console.log("Starting tests");
        setTimeout(runAll, 5000);
    });
});




function runAll() {

    const MaxTimeouts = 20000;
    var timeout_count = 0;

    var keyFromService = null

    const authUri = config.edge_config['authUri'];


    function getTokenTst() {

        token.getToken({
            org: org,
            env: env,
            id: tokenId,
            secret: tokenSecret
        }, (err, t) => {
            err && done(err);
            assert(t && t.token, "token came back empty " + JSON.stringify(t))
            //
            console.log('token: ' +  t.token);
            //
            //
            const opts = {
                algorithms: ['RS256'],
                ignoreExpiration: false
              };

            var token = t.token;
              
            jwt.verify(token, keyFromService, opts, function(err, result) {
                //
                if (err) {
                    assert(false);
                    return printError(err);
                }
                //
                if ( timeout_count < MaxTimeouts ) {
                    timeout_count++;
                    console.log( timeout_count + " :: " + (new Date()).toUTCString() )
                    getTokenTst();
                } else {
                    // close agent server before finishing
                    //restServer.close(()=>{
                        console.log("DONE WITH TESTING");
                        agent.stop();
                    //});
                }
            });
        })
    }

    function getPublicKey(organization, environment, authUri, isPublicCloud) {
        //
        const uri = isPublicCloud ? util.format(authUri + '/publicKey', organization, environment) : authUri + '/publicKey';
        //
        request({
            uri: uri
        }, function(err, res) {
            if (err) { 
                console.log(err)
            }
            //
            if ( keyFromService == null ) {
                keyFromService = res.body;
            }
            //
            getTokenTst()
           //
        });
        //
    }

    getPublicKey(org, env, authUri, true)
}


