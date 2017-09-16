"use strict";

const pem = require("pem");
const util = require("util");
const debug = require("debug")("jwkrotatekey");
const commander = require('commander');
const request = require("request");



function createCert(cb) {

    const options = {
        selfSigned: true,
        days: 1
    };

    pem.createCertificate(options, cb);
}

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

const RotateKey = function () {

}

module.exports = function () {
  return new RotateKey();
}

RotateKey.prototype.rotatekey = function rotatekey(options, cb) {

    options.baseuri = options.mgmtUrl || "https://api.enterprise.apigee.com";
    options.kvm = "microgateway";
    options.kid =  options.kid || "2";

    var privateKeyURI = util.format("%s/v1/organizations/%s/environments/%s/keyvaluemaps/%s/entries/private_key",
        options.baseuri, options.org, options.env, options.kvm);
    console.log("Checking if private key in the KVM...");
    request({
        uri: privateKeyURI,
        auth: generateCredentialsObject(options),
        method: "GET"
    }, function(err, res, body) {
        if (err) {
            console.error(err);
        } else {
            console.log("Private key found");
            var publicKeyURI = util.format("https://%s-%s.apigee.net/edgemicro-auth/publicKey",
                options.org, options.env);
            console.log("Checking for public key...");
            request({
                uri: publicKeyURI,
                auth: generateCredentialsObject(options),
                method: "GET"
            }, function(err, res, body) {
                if (err) {
                    console.error(err);
                } else {
                    console.log("Public key found!");
                    pem.getPublicKey(body, function(err, oldPublicKey) {
                        console.log("Public Key: ");
                        console.log(oldPublicKey.publicKey);
                        console.log("Generating New key/cert pair...");
                        createCert(function(err, newkeys) {
                            var updatekvmuri = util.format("%s/v1/organizations/%s/environments/%s/keyvaluemaps/%s",
                                options.baseuri, options.org, options.env, options.kvm);
                            console.log("New Private Key");
                            console.log(newkeys.serviceKey);
                            console.log("New Public Key");
                            console.log(newkeys.certificate);
                            pem.getPublicKey(newkeys.certificate, function(err, newkey) {
                                var payload = {
                                    "name": options.kvm,
                                    "encrypted": "true",
                                    "entry": [{
                                            "name": "private_key",
                                            "value": newkeys.serviceKey
                                        },
                                        {
                                            "name": "private_key_kid",
                                            "value": options.kid
                                        },
                                        {
                                            "name": "public_key",
                                            "value": newkeys.certificate
                                        },
                                        {
                                            "name": "public_key1",
                                            "value": newkey.publicKey
                                        },
                                        {
                                            "name": "public_key1_kid",
                                            "value": options.kid
                                        },
                                        {
                                            "name": "public_key2",
                                            "value": oldPublicKey.publicKey
                                        },
                                        {
                                            "name": "public_key2_kid",
                                            "value": "1"
                                        }
                                    ]
                                };
                                console.log("Upload Key cert pair to KVM");
                                request({
                                    uri: updatekvmuri,
                                    auth: generateCredentialsObject(options),
                                    method: "POST",
                                    json: payload
                                }, function(err, res, body) {
                                    if (err) {
                                        console.error(err);
                                    } else {
                                        console.log("Key rotation complete");
                                    }
                                });
                            });
                        });
                    });
                }
            });
        }
    });
}

