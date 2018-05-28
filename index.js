'use strict';

const configure = require('./cli/lib/configure')();
const gateway = require('./cli/lib/gateway')();
const cert = require('./cli/lib/cert')();
const configurePrivate = require('./cli/lib/private')();
const token = require('./cli/lib/token')();
const generateKeys = require('./cli/lib/key-gen')();


module.exports = {
    configure: configure,
    edgemicro: gateway,
    configurePrivate: configurePrivate,
    token: token,
    cert: cert,
    generateKeys: generateKeys,
};