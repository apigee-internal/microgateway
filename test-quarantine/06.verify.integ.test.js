'use strict';
const assert = require('assert');
const { spawn, spawnSync, execSync } = require("child_process");
describe('verify module', () => {
	
	it('verifies configuration', (done) => {
		let verifyChild = spawnSync('node', ['tests/childProcs/verifyChild.test.js']);
			let outDataStr = Buffer.from(verifyChild.stdout).toString();
			let errDataStr = Buffer.from(verifyChild.stderr).toString();
			assert.equal(outDataStr.includes('verification complete'),true);
			assert.equal(errDataStr.includes('FAIL'), false);
			done();
	});

});

