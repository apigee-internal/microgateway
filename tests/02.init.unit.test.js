'use strict';

const init = require('../cli/lib/init.js');
const loc = require('../config/locations.js');
const os = require('os');
const path = require('path');
const assert = require('assert');
const fs = require('fs');
const edgemicroCustomDir = 'edgemicroCustomDir';
const edgemicroCustomFilepath = path.join(edgemicroCustomDir, loc.defaultFile);

describe('init module', () => {

	before((done) => {
		try{
			if(fs.existsSync(edgemicroCustomFilepath)) fs.unlinkSync(edgemicroCustomFilepath);
			if(fs.existsSync(edgemicroCustomDir)) fs.rmdirSync(edgemicroCustomDir);
		} catch(err){
			console.error(err);
		}
		done();
	});

	after( (done) => {
		try{
			if(fs.existsSync(edgemicroCustomFilepath)) fs.unlinkSync(edgemicroCustomFilepath);
			if(fs.existsSync(edgemicroCustomDir)) fs.rmdirSync(edgemicroCustomDir);
		} catch(err){
			console.error(err);
		}
		done();
	});

	it('creates init config file in default home directory', (done) => {
		init({}, (err, location) => {
			assert.equal(err, null);
			assert.deepStrictEqual(loc.getDefaultPath(), location);
			let srcFile = fs.readFileSync(loc.getDefaultPath(), 'utf8');
			let destFile = fs.readFileSync(location, 'utf8');
			assert.deepStrictEqual(srcFile, destFile);
			done();
		});
	});


	it('allows custom directory to store configuration files', (done) => {
		init({configDir: edgemicroCustomDir},  (err, location) => {
			assert.equal(err, null);
			assert.deepStrictEqual(edgemicroCustomFilepath, location);
			let srcFile = fs.readFileSync(loc.getDefaultPath(), 'utf8');
			let destFile = fs.readFileSync(location, 'utf8');
			assert.deepStrictEqual(srcFile, destFile);
			done();
		});
	});

});
