'use strict';

const path = require('path');
const proxyValidator = require(path.join(__dirname,'..','lib','proxy-validator.js'));
const assert = require('assert');
const fs = require('fs');
const jsyaml = require('js-yaml');
let proxyConfig = require(path.join(__dirname, 'fixtures','proxyValidateConfig.js'));
let cachedJSON = jsyaml.load(fs.readFileSync(path.join(__dirname, 'fixtures', 'cached.yaml')))

describe('proxy-validator module', () => {
	it('validates proxies in config', (done) => {
		try{
			proxyValidator.validate(proxyConfig);
		}catch(err){
			console.error(err);
			assert.equal(err, null);
		}
		done();
	});

	it('validates yaml config', (done) => {
		try{
			proxyValidator.validate(cachedJSON);
		}catch(err){
			console.error(err);
			assert.equal(err, null);
		}
		done();
	});
});