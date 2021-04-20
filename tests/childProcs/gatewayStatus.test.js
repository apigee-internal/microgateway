'use strict';
const gateway = require('../../cli/lib/gateway.js')();


const envVars = require('../env.js');
const { env, org, key, secret } = envVars;
gateway.status({ env, org, key, secret });
