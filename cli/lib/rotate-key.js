"use strict";

const pem = require("pem");
const util = require("util");
const fs = require('fs');
const path = require('path');
const debug = require("debug")("jwkrotatekey");
//const commander = require('commander');
const request = require('request');
const writeConsoleLog = require('../../core').Logging.writeConsoleLog;

const CONSOLE_LOG_TAG_COMP = 'microgateway rotate key';

function createCert(cb) {

    const options = {
        selfSigned: true,
        days: 1
    };

    pem.createCertificate(options, cb);
}

function generateCredentialsObject(options) {
    return {
        user: options.key,
        pass: options.secret
    };
}

function extractPublicKey(options, newServiceKey, newCertificate) {
    writeConsoleLog('log',{component: CONSOLE_LOG_TAG_COMP},"Extract new public key");
    pem.getPublicKey(newCertificate, function(err, newPublicKey) {
        if (err) {
            writeConsoleLog('error',{component: CONSOLE_LOG_TAG_COMP},err);
            process.exit(1);
        } else {
            updateOrInsertEntry(options, newServiceKey, newCertificate, newPublicKey.publicKey);
        }
    });
}

const RotateKey = function () {
    
}

module.exports = function () {
return new RotateKey();
}

RotateKey.prototype.rotatekey = function rotatekey(options) {
    if (options.privatekey && options.cert) {
        writeConsoleLog('log',{component: CONSOLE_LOG_TAG_COMP},"Reading key/cert pair...");
        //reading key and cert from given file paths.
        try{
            const newServiceKey = fs.readFileSync(path.resolve(options.privatekey), 'utf8');
            const newCertificate = fs.readFileSync(path.resolve(options.cert), 'utf8');
            extractPublicKey(options, newServiceKey, newCertificate);
        }catch(err){
            writeConsoleLog('log',{component: CONSOLE_LOG_TAG_COMP},err);
            process.exit(1);
        }
    } else {
        writeConsoleLog('log',{component: CONSOLE_LOG_TAG_COMP},"Generating New key/cert pair...");
        createCert(function(err, newkeys) {
            if (err){
                writeConsoleLog('error',{component: CONSOLE_LOG_TAG_COMP},err);
                process.exit(1);
            } else{
                const newServiceKey = newkeys.serviceKey;
                const newCertificate = newkeys.certificate;
                extractPublicKey(options, newServiceKey, newCertificate);
            }
        });
    }
}

function updateOrInsertEntry(options, newServiceKey, newCertificate, newPublicKey){
    let rotateKeyUri = null;
    if (options.rotatekeyuri){
        rotateKeyUri = options.rotatekeyuri; 
    } else{
        rotateKeyUri = util.format('https://%s-%s.apigee.net/edgemicro-auth/rotateKey', options.org, options.env);
    }
    const body = {
        private_key_kid: options.kid,
        private_key: newServiceKey,
        public_key: newCertificate,
        public_key1: newPublicKey
    };
    if(options.nbf){
        //converting min to milliseconds.
        const nbf = options.nbf * 60 * 1000;
        body.future_keys_nbf = nbf;
    }
    request({
        uri: rotateKeyUri,
        auth: generateCredentialsObject(options),
        method: "POST",
        json: body
    },function (err, res) {
        if (err){
            writeConsoleLog('error',{component: CONSOLE_LOG_TAG_COMP},err);
            process.exit(1);
        } else {
            if (res.statusCode === 200){
                writeConsoleLog('log',{component: CONSOLE_LOG_TAG_COMP}, res.body);
                process.exit(0);
            } else{
                writeConsoleLog('error',{component: CONSOLE_LOG_TAG_COMP}, res.statusCode, res.body);
                process.exit(1);
            }
        } 
    });
}
