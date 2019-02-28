'use strict';
const gateway = require('../../cli/lib/gateway.js')();

const envVars = require('../env.js');
const {user:username, password, env, org, tokenId:id, tokenSecret, key, secret } = envVars;
gateway.start({username, password, org, env, key, secret});
