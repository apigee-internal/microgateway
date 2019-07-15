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

    it('gets public key first',function(done) {
        //
        this.timeout(5000);
        //
        function getPublicKey(organization, environment, authUri, isPublicCloud, cb) {
            //
            const uri = isPublicCloud ? util.format(authUri + '/publicKey', organization, environment) : authUri + '/publicKey';
            //
            request({
              uri: uri
            }, function(err, res) {
              if (err) { return cb(err); }
              cb(null, res.body);
            });
            //
        }

        const authUri = config.edge_config['authUri'];

        getPublicKey(org,env,authUri,true,(err,data) => {
            console.log(data);
            //
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
                  
                jwt.verify(token, data, opts, function(err, result) {
                    //
                    if (err) {
                        assert(false);
                        done(err)
                        return printError(err);
                    }
                    //
                    assert(true);
                    done();
                    //
                });

            })
        })
          
    })

});
