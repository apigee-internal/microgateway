'use strict';

const envVars = require('../env.js');
const { user: username, password, env, org, key, secret, tokenId, tokenSecret } = envVars;
const verify = require('../../cli/lib/verify.js')();

verify.verify({username, password, env, org, key, secret});