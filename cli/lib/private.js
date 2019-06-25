'use strict';

const fs = require('fs');
const path = require('path');
const apigeetool = require('apigeetool');
const util = require('util');
const url = require('url');
const request = require('request');
const debug = require('debug')('edgemicro');
const async = require('async');
const crypto = require('crypto');
const _ = require('lodash');
const parser = new(require('xml2js')).Parser();
const builder = new(require('xml2js')).Builder();
const assert = require('assert');
const cert = require('./cert-lib');
const edgeconfig = require('microgateway-config');
const configLocations = require('../../config/locations');
const deploymentFx = require('./deploy-auth');

const DEFAULT_HOSTS = 'default,secure';

const Private = function() {};
module.exports = function() {
    return new Private();
};


// begins edgemicro configuration process
Private.prototype.configureEdgemicro = function(options, cb) {
    if (!fs.existsSync(configLocations.getDefaultPath(options.configDir))) {
        console.error("Missing %s, Please run 'edgemicro init'", configLocations.getDefaultPath(options.configDir))
        return cb("Please call edgemicro init first")
    }

    if (!options.token) {
        assert(options.username, 'username is required');
        assert(options.password, 'password is required');
    }

    assert(options.org, 'org is required');
    assert(options.env, 'env is required');
    assert(options.runtimeUrl, 'runtimeUrl is required');
    assert(options.mgmtUrl, 'mgmtUrl is required');

    const cache = configLocations.getCachePath(options.org, options.env);
    console.log('delete cache config');
    if (fs.existsSync(cache)) {
        fs.unlinkSync(cache);
        console.log('deleted ' + cache);
    }

    const targetPath = configLocations.getSourcePath(options.org, options.env);
    if (fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath);
        console.log('deleted ' + targetPath);
    }

    options.proxyName = this.name = 'edgemicro-auth';
    this.basePath = '/edgemicro-auth';
    this.managementUri = options.mgmtUrl;
    this.runtimeUrl = options.runtimeUrl;
    this.virtualHosts = options.virtualHosts || 'default';


    const config = edgeconfig.load({
        source: configLocations.getDefaultPath(options.configDir)
    });
    this.config = config;
    this.authUri = config.edge_config.authUri = this.runtimeUrl + this.basePath;
    this.config.edge_config.managementUri = this.managementUri;
    this.baseUri = this.runtimeUrl + '/edgemicro/%s/organization/%s/environment/%s';
    this.vaultName = config.edge_config.vaultName;
    this.config.edge_config.baseUri = this.baseUri;
    this.deployment = deploymentFx(config.edge_config, this.virtualHosts);
    // first: runtimeUri, second: credential, third: org, fourth: env
    this.credentialUrl = util.format(this.baseUri, 'credential', options.org, options.env);
    this.regionUrl = util.format(this.baseUri, 'region', options.org, options.env);
    this.bootstrapUrl = util.format(this.baseUri, 'bootstrap', options.org, options.env);

    this.cert = cert(this.config);
    this.sourcePath = configLocations.getSourcePath(options.org, options.env);

    var configFileDirectory = options.configDir || configLocations.homeDir;

    const that = this;
    console.log('init config');
    edgeconfig.init({
        source: configLocations.getDefaultPath(options.configDir),
        targetDir: configFileDirectory,
        targetFile: configLocations.getSourceFile(options.org, options.env),
        overwrite: true
    }, function(err, configPath) {
        edgeconfig.save(that.config, that.sourcePath);
        options.deployed = false;
        options.internaldeployed = false;
        that.deployment.checkDeployedProxies(options, (err, options) => {
            if (err) {
                console.error(err);
                if ( cb ) { cb(err) } else process.exit(1);
                return;
            } else {
                that.deployment.checkDeployedInternalProxies(options, (err, options) => {
                    if (err) {
                        console.error(err);
                        if ( cb ) { cb(err) } else process.exit(1);
                        return;
                    } else {
                        that.configureEdgemicroWithCreds(options, (err) => {
                            if (err) {
                                console.error(err);
                                if ( cb ) { cb(err) } else process.exit(1);
                                return;
                            }
                            if ( cb ) { cb(err) } else process.exit(0);
                        });
                    }
                });
            }
        });
    });

}


// configures Callout.xml & default.xml of apiproxy being deployed
Private.prototype.configureEdgeMicroInternalProxy = function configureEdgeMicroInternalProxy(options, callback) {
    const that = this;
    const apipath = path.join(__dirname, '..', '..', 'edge', 'apiproxy');
    options.proxyName = 'edgemicro-auth';
    var resPath;
    try {
        resPath = fs.realpathSync(apipath);
    } catch (e) {
        return callback(e);
    }

    const calloutFlow = [
        function(cb) {
            fs.readFile(path.join(resPath, 'policies', 'Callout.xml'), cb);
        },
        function(calloutData, cb) {
            parser.parseString(calloutData, cb);
        },
        function(calloutObj, cb) {
            // change proxy url
            calloutObj.JavaCallout.Properties[0].Property[1]['_'] = 'DN=' + that.runtimeUrl;

            // add management server location
            const mgmtSearch = _.findIndex(calloutObj.JavaCallout.Properties[0].Property, function(prop) {
                return prop['$'].name === 'MGMT_URL_PREFIX';
            });

            if (mgmtSearch === -1) {
                calloutObj.JavaCallout.Properties[0].Property.push({
                    '_': that.managementUri,
                    '$': {
                        name: 'MGMT_URL_PREFIX'
                    }
                });
            } else {
                calloutObj.JavaCallout.Properties[0].Property[mgmtSearch]['_'] = that.managementUri;
            }

            // build js obj back into xml
            calloutObj = builder.buildObject(calloutObj)

            // continue with callout as xml
            cb(null, calloutObj);
        },
        function(calloutXml, cb) {
            // write xml back to file
            fs.writeFile(path.join(path.join(resPath, 'policies', 'Callout.xml')), calloutXml, cb);
        }
    ];

    const tasks = [
        function(parallelCb) {
            async.waterfall(calloutFlow, function(err, result) {
                if (err) {
                    console.log('error - editing apiproxy Callout.xml');
                    return parallelCb(err);
                }

                parallelCb(null, null);
            });
        }
    ];


    // only edit default.xml when virutalHosts is not default
    if (that.virtualHosts !== DEFAULT_HOSTS) {

        const defaultFlow = [
            function(cb) {
                // read defaul xml
                fs.readFile(path.join(resPath, 'proxies', 'default.xml'), cb);
            },
            function(defaultData, cb) {
                // parse default xml into object
                parser.parseString(defaultData, cb);
            },
            function(defaultObj, cb) {
                const vhosts = that.virtualHosts.split(',');

                // edit default obj values
                defaultObj.ProxyEndpoint.HTTPProxyConnection[0].VirtualHost = vhosts;
                // build default object back into xml
                defaultObj = builder.buildObject(defaultObj);

                cb(null, defaultObj);
            },
            function(defaultXml, cb) {
                // write default xml back to file
                fs.writeFile(path.join(resPath, 'proxies', 'default.xml'), defaultXml, cb);
            }
        ];

        tasks.push(function(parallelCb) {
            async.waterfall(defaultFlow, function(err, result) {
                if (err) {
                    console.log('error - editing apiproxy default.xml');
                    return parallelCb(err);
                }

                parallelCb(null, null);
            });
        });
    }

    // run configuration editing in parallel
    async.parallel(tasks, function(err, results) {
        if (err) {
            return callback(err);
        }

        callback(null, null);
    })
}

// checks deployments, deploys proxies as necessary, checks/installs certs, generates keys
Private.prototype.configureEdgemicroWithCreds = function configureEdgemicroWithCreds(options, cb) {
    const that = this;
    const sourcePath = that.sourcePath;

    const tasks = [];

    if (options.internaldeployed == false) {
        tasks.push(function(callback) {
            console.log('configuring edgemicro internal proxy');
            that.configureEdgeMicroInternalProxy(options, callback);
        });

        tasks.push(function(callback) {
            console.log('deploying edgemicro internal proxy');
            that.deployment.deployEdgeMicroInternalProxy(options, callback);
        });
    } else {
        console.log('Proxy edgemicro-internal is already deployed');
    }

    if (options.deployed == false) {
        tasks.push(function(callback) {
            console.log('deploying ', that.name, ' app');
            that.deployment.deployWithLeanPayload(options, callback);
        });
    } else {
        console.log(that.name, ' is already deployed');
    }

    tasks.push(function(callback) {
        console.log('checking org for existing KVM');
        that.cert.checkPrivateCert(options, function(err, certs) {
            if (err) {
                console.log('error checking for cert. Installing new cert.');
                that.cert.installCertWithPassword(options, callback);
            } else {
                console.log('KVM already exists in your org');
                that.cert.retrievePublicKeyPrivate(callback);
            }
        });
    });

    tasks.push(function(callback) {
        console.log('generating keys');
        that.generateKeysWithPassword(options, callback);
    });

    async.series(tasks,
        function(err, results) {
            if (err) {
                return cb(err);
            }
            const agentConfigPath = sourcePath;
            const agentConfig = that.config = edgeconfig.load({
                source: agentConfigPath
            });

            if (options.internaldeployed == false && options.deployed == false) {
                agentConfig['edge_config']['jwt_public_key'] = results[2]; // get deploy results
                agentConfig['edge_config'].bootstrap = results[4]; // get genkeys results
            } else if (options.internaldeployed == true && options.internaldeployed == false) {
                agentConfig['edge_config']['jwt_public_key'] = results[0];
                agentConfig['edge_config'].bootstrap = results[2];
            } else {
                agentConfig['edge_config']['jwt_public_key'] = that.authUri + '/publicKey';
                agentConfig['edge_config'].bootstrap = results[1];
            }

            var publicKeyUri = agentConfig['edge_config']['jwt_public_key'];
            if (publicKeyUri) {
                agentConfig['edge_config']['products'] = publicKeyUri.replace('publicKey', 'products');

                if (!agentConfig.hasOwnProperty('oauth') || agentConfig['oauth'] == null) {
                    agentConfig['oauth'] = {};
                }
                agentConfig['oauth']['verify_api_key_url'] = publicKeyUri.replace('publicKey', 'verifyApiKey');
            }

            var bootstrapUri = agentConfig['edge_config']['bootstrap'];
            if (bootstrapUri) {
                if (!agentConfig.hasOwnProperty('analytics') || agentConfig['analytics'] == null) {
                    agentConfig['analytics'] = {};
                }

                agentConfig['analytics']['uri'] = bootstrapUri.replace('bootstrap', 'axpublisher');
                agentConfig['analytics']['bufferSize'] = 100;
                agentConfig['analytics']['batchSize'] = 50;
                agentConfig['analytics']['flushInterval'] = 500;
            }

            console.log();
            console.log('saving configuration information to:', agentConfigPath);
            edgeconfig.save(agentConfig, agentConfigPath);
            console.log();

            if (options.internaldeployed == false && options.deployed == false) {
                console.log('vault info:\n', results[3]);
            } else if (options.internaldeployed == true && options.internaldeployed == false) {
                console.log('vault info:\n', results[1]);
            }

            console.log('edgemicro configuration complete!');
            cb();

        });
};

Private.prototype.generateKeysWithPassword = function generateKeysWithPassword(options, cb) {

    const that = this;
    // first: runtimeUri, second: credential, third: org, fourth: env
    const credentialUrl = that.credentialUrl;
    const regionUrl = that.regionUrl;
    const bootstrapUrl = that.bootstrapUrl;
    const parsedUrl = url.parse(bootstrapUrl);
    const updatedUrl = url.format(parsedUrl); // reconstruct url with updated host

    function genkey(cb) {
        const byteLength = 256;
        const hash = crypto.createHash('sha256');
        hash.update(Date.now().toString());
        crypto.randomBytes(byteLength, function(err, buf) {
            if (err) {
                return cb(err);
            }

            hash.update(buf);
            hash.update(Date.now().toString());
            cb(null, hash.digest('hex'));
        });
    }

    async.series([
        function(callback) {
            genkey(callback);
        }, // generate the key
        function(callback) {
            genkey(callback);
        } // generate the secret
    ], function(err, results) {
        const key = results[0];
        const secret = results[1];
        const keys = {
            key: key,
            secret: secret
        };

        debug('sending', JSON.stringify(keys), 'to', credentialUrl);
        request({
            uri: credentialUrl,
            method: 'POST',
            auth: generateCredentialsObject(options),
            json: keys
        }, function(err, res) {
            err = translateError(err, res);
            if (err) {
                return cb(err);
            }

            if (res.statusCode >= 200 && res.statusCode <= 202) {
                debug('getting region from', regionUrl);
                request({
                    uri: regionUrl,
                    auth: {   // switch authorization to use the key/secret we just uploaded
                        username: key,
                        password: secret
                      },
                    json: true
                }, function(err, res) {
                    err = translateError(err, res);
                    if (err) {
                        return cb(err);
                    }

                    if (res.statusCode >= 200 && res.statusCode <= 202) {
                        if (!res.body.region || !res.body.host) {
                            cb(console.error('invalid response from region api', regionUrl, res.text));
                            return;
                        }

                        console.log('configuring host', res.body.host, 'for region', res.body.region);
                        const parsedRes = url.parse(res.body.host);
                        parsedUrl.host = parsedRes.host; // update to regional host
                        console.log();
                        console.info(that.config.edge_config.keySecretMessage);
                        console.info('  key:', key);
                        console.info('  secret:', secret);
                        console.log();
                        process.env.EDGEMICRO_KEY = key;
                        process.env.EDGEMICRO_SECRET = secret;
                        return cb(null, updatedUrl);
                    } else {
                        cb(console.error('error retrieving region for org', res.statusCode, res.text));
                    }
                });
            } else {
                cb(console.error('error uploading credentials', res.statusCode, res.text));
            }
        });
    });
}

function translateError(err, res) {
    if (!err && res.statusCode >= 400) {
        const msg = 'cannot ' + res.request.method + ' ' + url.format(res.request.uri) + ' (' + res.statusCode + ')';
        err = new Error(msg);
        err.text = res.body;
        res.error = err;
    }
    return err;
}

/*
function optionError(message) {
    console.error(message);
    this.help();
}
*/

function generateCredentialsObject(options) {
    if (options.token) {
        return {
            "bearer": options.token
        };
    } else {
        return {
            user: options.username,
            pass: options.password
        };
    }
}