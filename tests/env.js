'use strict';
const assert = require('assert');
const password = process.env.MOCHA_PASSWORD;
const key = process.env.MOCHA_KEY;
const secret = process.env.MOCHA_SECRET;
const user = process.env.MOCHA_USER;
const org = process.env.MOCHA_ORG;
const env = process.env.MOCHA_ENV;
const tokenSecret = process.env.MOCHA_TOKEN_SECRET;
const tokenId = process.env.MOCHA_TOKEN_ID;

assert(password, 'Must set environment variable MOCHA_PASSWORD');
assert(user, 'Must set environment variable MOCHA_KEY');
assert(org, 'Must set environment variable MOCHA_SECRET');
assert(env, 'Must set environment variable MOCHA_USER');
assert(key, 'Must set environment variable MOCHA_ORG');
assert(secret, 'Must set environment variable MOCHA_ENV');
assert(tokenId, 'Must set environment variable MOCHA_TOKEN_SECRET');
assert(tokenSecret, 'Must set environment variable MOCHA_TOKEN_ID');

module.exports = {
    password: password,
    key: key,
    secret: secret,
    user: user,
    org: org,
    env: env,
    tokenSecret: tokenSecret,
    tokenId: tokenId,
};