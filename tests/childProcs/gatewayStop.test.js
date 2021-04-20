'use strict';
const gateway = require('../../cli/lib/gateway.js')();

const envVars = require('../env.js');
const { env, org, key, secret } = envVars;
gateway.stop({ env, org, key, secret });