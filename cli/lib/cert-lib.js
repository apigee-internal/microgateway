'use strict';
const request = require('request');
const util = require('util');
const fs = require('fs');
const path = require('path');
const url = require('url');
const pem = require('pem');
const crypto = require('crypto');
const async = require('async');
const debug = require('debug')('cert')
//const yaml = require('js-yaml');
//const prompt = require('cli-prompt');

const ERR_STORE_EXISTS = 'com.apigee.secure-store.storekey.already.exists';
const ERR_STORE_MISSING = 'com.apigee.secure-store.securestore_does_not_exist';
//const ERR_STORE_ITEM_MISSING = 'com.apigee.secure-store.storeitem_does_not_exist';


const CertLogic = function(config) {
    this.managementUri = config.edge_config['managementUri'];
    this.vaultName = config.edge_config['vaultName'];
    this.baseUri = config.edge_config['baseUri'];
    this.authUri = config.edge_config['authUri'];
    this.bootstrapMessage = config.edge_config['bootstrapMessage'];
    this.keySecretMessage = config.edge_config['keySecretMessage'];
};

module.exports = function(config) {
    return new CertLogic(config)
};

CertLogic.prototype.retrievePublicKey = function(options, callback) {

    getPublicKey(options.org, options.env, this.authUri, function(err, certificate) {
        if (err) {
            return callback(err);
        }
        callback(null, certificate);
    });
}

CertLogic.prototype.retrievePublicKeyPrivate = function(callback) {

    const authUri = this.authUri;
    getPublicKeyPrivate(authUri, function(err, certificate) {
        if (err) {
            return callback(err);
        }
        callback(null, certificate);
    });
}

CertLogic.prototype.checkCertWithPassword = function(options, callback) {
    var uri = util.format('%s/v1/organizations/%s/environments/%s/keyvaluemaps/%s',
        this.managementUri, options.org, options.env, this.vaultName);
    request({
        uri: uri,
        auth: generateCredentialsObject(options)
    }, function(err, res, body) {
        err = translateError(err, res);
        if (err) {
            return callback(err);
        }
        callback(null, body);
    });
}

CertLogic.prototype.checkPrivateCert = function(options, callback) {

    var uri = util.format('%s/v1/organizations/%s/environments/%s/keyvaluemaps/%s/entries/private_key',
        this.managementUri, options.org, options.env, this.vaultName);

    request({
        uri: uri,
        auth: generateCredentialsObject(options)
    }, function(err, res) {
        err = translateError(err, res);
        if (err) {
            return callback(err);
        }

        callback(null, res.body);

    });

}

CertLogic.prototype.installPrivateCert = function(options, callback) {
    const managementUri = this.managementUri;
    const vaultName = this.vaultName;
    createCert(function(err, keys) {
        if (err) {
            if (callback) {
                return callback(err);
            } else {
                return console.log(err, err.stack);
            }
        }

        const privateKey = keys.serviceKey;
        const publicKey = keys.certificate;
        const async = require('async');

        pem.getPublicKey(publicKey, function(err, key) {
            async.series(
                [
                    function(cb) {
                        if (!options.force) {
                            return cb();
                        }
                        deleteVault(generateCredentialsObject(options), managementUri, options.org, options.env, vaultName, cb);
                    },
                    function(cb) {
                        console.log('creating KVM');
                        console.log('adding private_key');
                        console.log('adding public_key');
                        var entries = [{
                                'name': 'private_key',
                                'value': privateKey
                            },
                            {
                                'name': 'public_key',
                                'value': publicKey
                            },
                            {
                                'name': 'public_key1',
                                'value': key.publicKey
                            },
                            {
                                'name': 'private_key_kid',
                                'value': '1'
                            },
                            {
                                'name': 'public_key1_kid',
                                'value': '1'
                            }
                        ]
                        createVault(generateCredentialsObject(options), managementUri, options.org, options.env, vaultName, entries, cb);
                    }
                ],
                function(err) {
                    if (err) {
                        callback(err);
                    } else {
                        callback(null, publicKey);
                    }
                }
            );
        });
    });
}

CertLogic.prototype.installCertWithPassword = function(options, callback) {
    const managementUri = this.managementUri;
    const vaultName = this.vaultName;
    var privateKey;
    var publicKey;

    if (options.key && options.cert) {
        privateKey = fs.readFileSync(path.resolve(options.key), 'utf8');
        publicKey = fs.readFileSync(path.resolve(options.cert), 'utf8');
        uploadCert(options, managementUri, vaultName, privateKey, publicKey, callback);
    } else {
        createCert(function(err, keys) {
            if (err) {
                return callback(err);
            }

            privateKey = keys.serviceKey;
            publicKey = keys.certificate;
            uploadCert(options, managementUri, vaultName, privateKey, publicKey, callback);
        });
    }
}


CertLogic.prototype.generateKeysWithPassword = function generateKeysWithPassword(options, cb) {

    //const keySecretMessage = this.keySecretMessage;
    // bootstrapMessage = this.bootstrapMessage;
    const managementUri = this.baseUri;

    function genkey(cb) {
        var byteLength = 256;
        var hash = crypto.createHash('sha256');
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
        var key = results[0];
        var secret = results[1];
        var keys = {
            key: key,
            secret: secret
        };

        var credentialUrl = util.format(managementUri, 'credential', options.org, options.env);

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

                var regionUrl = util.format(managementUri, 'region', options.org, options.env);

                debug('getting region from', regionUrl);
                request({
                    uri: regionUrl,
                    auth: { // switch authorization to use the key/secret we just uploaded
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
                            if (cb) {
                                cb(console.error('invalid response from region api', regionUrl, res.text));
                            } else {
                                console.error('invalid response from region api', regionUrl, res.text);
                            }

                            return;
                        }

                        console.log('configuring host', res.body.host, 'for region', res.body.region);
                        var bootstrapUrl = util.format(managementUri, 'bootstrap', options.org, options.env);
                        var parsedUrl = url.parse(bootstrapUrl);
                        parsedUrl.host = res.body.host; // update to regional host
                        var updatedUrl = url.format(parsedUrl); // reconstruct url with updated host

                        return cb(null, {
                            bootstrap: updatedUrl,
                            key: key,
                            secret: secret
                        });


                    } else {
                        cb(console.error('error retrieving region for org', res.statusCode, res.text));
                    }
                });
            } else {
                cb(console.error('error uploading credentials', res.statusCode, res.text));
            }
        });
    });

};

CertLogic.prototype.deleteCertWithPassword = function deleteCertWithPassword(options, cb) {
    const managementUri = this.managementUri;
    const vaultName = this.vaultName;

    deleteVault(generateCredentialsObject(options), managementUri, options.org, options.env, vaultName, function(err) {
        if (err) {
            cb(err);
        } else {
            cb(null, 'KVM deleted!');
        }
    });
};

// response: { certificate, csr, clientKey, serviceKey }
function createCert(cb) {

    const options = {
        /*
         serviceKey is a private key for signing the certificate, if not defined a new one is generated
         serviceCertificate is the optional certificate for the serviceKey
         serial is the unique serial number for the signed certificate, required if serviceCertificate is defined
         selfSigned - if set to true and serviceKey is not defined, use clientKey for signing
         csr is a CSR for the certificate, if not defined a new one is generated
         days is the certificate expire time in days
         */
        selfSigned: true,
        days: 1
    };

    pem.createCertificate(options, cb);
}

function deleteVault(credentials, managementUri, organization, environment, vaultName, cb) {
    console.log('deleting KVM');

    var uri = util.format('%s/v1/organizations/%s/environments/%s/keyvaluemaps/%s', managementUri, organization, environment, vaultName);

    request({
        uri: uri,
        method: 'DELETE',
        auth: credentials
    }, function(err, res) {
        err = translateError(err, res);
        if (isApigeeError(err, ERR_STORE_MISSING)) {
            err = undefined;
        }

        cb(err, res);
    });



}

function createVault(credentials, managementUri, organization, environment, vaultName, entries, cb) {

    var storageOpts = {
        name: vaultName,
        encrypted: 'true',
        entry: entries
    }
    var uri = util.format('%s/v1/organizations/%s/environments/%s/keyvaluemaps', managementUri, organization, environment);

    request({
        uri: uri,
        method: 'POST',
        auth: credentials,
        json: storageOpts
    }, function(err, res) {
        err = translateError(err, res);
        if (isApigeeError(err, ERR_STORE_EXISTS)) {
            err = new Error('Store already exists. Use --force to replace keys.');
        }

        cb(err, res);
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

function isApigeeError(err, code) {

    if (err && err.response && err.response.text) {
        return err.response.error.text.indexOf(code) > -1;
    }
    return false;
}

function getPublicKey(organization, environment, authUri, cb) {

    const uri = authUri + '/publicKey';
    request({
        uri: uri,
    }, function(err, res) {
        err = translateError(err, res);
        if (err) {
            return cb(err);
        }
        cb(null, res.body);
    });
}

function getPublicKeyPrivate(authUri, cb) {
    const runtimeUri = authUri + '/publicKey';

    request({
        uri: runtimeUri,
    }, function(err, res) {
        err = translateError(err, res);
        if (err) {
            return cb(err);
        }
        cb(null, res.body);
    });
}

function generateCredentialsObject(options) {
    if (options.token) {
        return {
            'bearer': options.token
        };
    } else {
        return {
            user: options.username,
            pass: options.password
        };
    }
}

function uploadCert(options, managementUri, vaultName, privateKey, publicKey, callback) {
    const async = require('async');

    pem.getPublicKey(publicKey, function(err, key) {
        async.series(
            [
                function(cb) {
                    if (!options.force) {
                        return cb();
                    }
                    deleteVault(generateCredentialsObject(options), managementUri, options.org, options.env, vaultName, cb);
                },
                function(cb) {
                    console.log('creating KVM');
                    console.log('adding private_key');
                    console.log('adding public_key');
                    var entries = [{
                            'name': 'private_key',
                            'value': privateKey
                        },
                        {
                            'name': 'public_key',
                            'value': publicKey
                        },
                        {
                            'name': 'public_key1',
                            'value': key.publicKey
                        },
                        {
                            'name': 'private_key_kid',
                            'value': '1'
                        },
                        {
                            'name': 'public_key1_kid',
                            'value': '1'
                        }
                    ]
                    createVault(generateCredentialsObject(options), managementUri, options.org, options.env, vaultName, entries, cb);
                }
            ],
            function(err) {
                if (err) {
                    callback(err);
                } else {
                    callback(null, publicKey);
                }
            }
        );
    });
}