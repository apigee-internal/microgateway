"use strict";

const pem = require("pem");
const util = require("util");
const debug = require("debug")("upgradekvm");
const request = require('request');
const writeConsoleLog = require('../../core').Logging.writeConsoleLog;
const CONSOLE_LOG_TAG_COMP = 'microgateway upgrade kvm';

function generateCredentialsObject(options) {
    return {
        user: options.key,
        pass: options.secret
    };
}

function updatekvm(options, baseUri){
    writeConsoleLog('log',{component: CONSOLE_LOG_TAG_COMP}, 'Updating KVM entries'); 
    const body = {
        public_key: options.publicKey1
    };
    request({
        uri: baseUri+'upgradeKvm',
        auth: generateCredentialsObject(options),
        method: "POST",
        json: body
    },function (err, res) {
        if (err){
            writeConsoleLog('log',{component: CONSOLE_LOG_TAG_COMP},"Error in upgrade kvm: "+ err);
            process.exit(1);
        } else {
            if (res.statusCode === 200){
                writeConsoleLog('log',{component: CONSOLE_LOG_TAG_COMP}, res.body);
                process.exit(0);
            } else{
                writeConsoleLog('log',{component: CONSOLE_LOG_TAG_COMP}, res.statusCode, res.body);
                process.exit(1);
            }
        } 
    });
}

const UpgradeKVM = function () {

}

module.exports = function () {
    return new UpgradeKVM();
}

UpgradeKVM.prototype.upgradekvm = function upgradekvm(options, cb) {
    let baseUri = null;
    if (options.proxyuri){
        baseUri = options.proxyuri.endsWith("/") ? options.proxyuri : options.proxyuri+'/';   
    } else{
        baseUri = util.format('https://%s-%s.apigee.net/edgemicro-auth/', options.org, options.env);
    }
    writeConsoleLog('log',{component: CONSOLE_LOG_TAG_COMP},"Checking for certificate...");
    request({
        uri: baseUri+'publicKey',
        auth: generateCredentialsObject(options),
        method: "GET"
    }, function(err, res) {
        if (err) {
            writeConsoleLog('error',{component: CONSOLE_LOG_TAG_COMP},err);
            process.exit(1);
        } else {
            if(res.statusCode === 200 && res.body !== 'null'){
                writeConsoleLog('log',{component: CONSOLE_LOG_TAG_COMP},"Certificate found!");
                pem.getPublicKey(res.body, function(err, publicKey) {
                    if (err) {
                        writeConsoleLog('error',{component: CONSOLE_LOG_TAG_COMP},err);
                        process.exit(1);
                    } else {
                        writeConsoleLog('log',{component: CONSOLE_LOG_TAG_COMP},publicKey.publicKey);
                        options.publicKey1 = publicKey.publicKey;
                        updatekvm(options, baseUri)
                    }
                });
            } else{
                writeConsoleLog('log',{component: CONSOLE_LOG_TAG_COMP}, res.statusCode, res.body ); 
                process.exit(1);
            }
        }
    });
}
