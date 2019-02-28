'use strict';
const assert = require('assert');
const { spawn, spawnSync, execSync } = require('child_process');

describe('verify module', () => {

	it('verifies configuration', (done) => {
		let verifyChild = spawn('node', ['tests/childProcs/verifyChild.test.js']);

			let outDataStr;
			verifyChild.stdout.on('data', data=>{
				outDataStr += Buffer.from(data).toString();
				console.log('verifyChild-out', outDataStr);
				if(outDataStr.includes('verification complete')) {
					verifyChild.kill();
					done();
				}
			});

			let errDataString;
			verifyChild.stderr.on('data', errData =>{
				errDataString += Buffer.from(errData).toString()
				console.log('verifyChild-err', errDataString);
				if(outDataStr.includes('FAIL')) {
					assert(false);
					verifyChild.kill();
					done();
				}
			});
	});
});

