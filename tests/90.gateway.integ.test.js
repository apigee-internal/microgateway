// gateway.test.js

'use strict';

const gateway = require('../cli/lib/gateway.js')();
const assert = require('assert');
const path = require('path');
const denv = require('dotenv');
denv.config();
const envVars = require('./env.js');
const {user:username, password, env, org, tokenId:id, tokenSecret, key, secret } = envVars;
const { spawn, spawnSync, execSync } = require("child_process");

describe('gateway module', () => {
	it('displays "edgemicro is not running" mgw status when not running',  (done) => {
		let gatewayStatus = spawnSync('node', ['tests/childProcs/gatewayStatus.test.js']);
		let errString = Buffer.from(gatewayStatus.stderr).toString();
		assert.equal(errString.includes('edgemicro is not running'), true);
		done();
	});

	it('displays "edgemicro is not running" when attempting to reload non-running mgw', (done) => {
		let gatewayReload = spawnSync('node', ['tests/childProcs/gatewayReload.test.js']);
		let errString = Buffer.from(gatewayReload.stderr).toString();
		assert.equal(errString.includes('edgemicro is not running'), true);
		done();
	});

	it('displays "edgemicro is not running" when attempting to stop a non-running mgw', (done) => {
		let gatewayStop = spawnSync('node', ['tests/childProcs/gatewayStop.test.js']);
		let errString = Buffer.from(gatewayStop.stderr).toString();
		assert.equal(errString.includes('edgemicro is not running'), true) ;
		done();
	});

});