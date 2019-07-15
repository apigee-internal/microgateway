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

	it('starts mgw', (done) => {
		let gatewayStart = spawn('node', ['tests/childProcs/gatewayStart.test.js']);

			let outData = [];
			gatewayStart.stdout.on('data', data=>{
				outData.push(data);
				let outDataStr = Buffer.concat(outData).toString();
				if(outDataStr.includes('PROCESS PID :')) {
					outData = [];
					done();
				}
			});

			gatewayStart.stderr.on('data', errData =>{
				console.log('errData',Buffer.from(errData).toString());
			});
	});

	it('provides mgw status when running',(done) => {
		let gatewayStatus = spawnSync('node', ['tests/childProcs/gatewayStatus.test.js']);
		let outString = Buffer.from(gatewayStatus.stdout).toString();
		assert.equal(outString.includes('edgemicro is running with'), true) 
		done();
	});

	it('reloads mgw when running',  (done) => {
		let gatewayReload = spawnSync('node', ['tests/childProcs/gatewayReload.test.js']);
		let outString = Buffer.from(gatewayReload.stdout).toString();
		assert.equal(outString.includes('Reload Completed Successfully'), true);
		done();
	});

	it('stop mgw when running', done=> {
		let gatewayStop = spawnSync('node', ['tests/childProcs/gatewayStop.test.js']);
		let outString = Buffer.from(gatewayStop.stdout).toString();
		assert.equal(outString.includes('Stop Completed Succesfully'), true);
		done();
	});

});