'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const jwt = require('../cli/lib/token.js')();
let jwtFilePath = path.join(__dirname, './fixtures/jwt.txt');

describe('test token.js - jwt module', () => {
	it('decodes a jwt stored in a file', (done) => {
		const tokenData = jwt.decodeToken({file:jwtFilePath});
		assert.deepEqual(tokenData.header, { kid: '1', typ: 'JWT', alg: 'RS256' });
		assert.equal(tokenData.payload.aud, 'microgateway');
		done();
	});
});
