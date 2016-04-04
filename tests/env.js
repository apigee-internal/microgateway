'use strict'
const assert = require('assert');
const password = process.env.MOCHA_PASSWORD;
const key = process.env.MOCHA_KEY;
const secret = process.env.MOCHA_SECRET;
const user = process.env.MOCHA_USER;
const org = process.env.MOCHA_ORG;
const env = process.env.MOCHA_ENV;
const tokenSecret = process.env.MOCHA_TOKEN_SECRET;
const tokenId = process.env.MOCHA_TOKEN_ID;

assert(password);
assert(user);
assert(org);
assert(env);
assert(key);
assert(secret);
assert(tokenId);
assert(tokenSecret);

module.exports = {
  password:password,
  key:key,
  secret:secret,
  user:user,
  org:org,
  env:env,
  tokenSecret:tokenSecret,
  tokenId:tokenId
};