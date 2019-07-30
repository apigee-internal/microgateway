'use strict';

const assert = require('assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const jsyaml = require('js-yaml');
const denv = require('dotenv');
denv.config();
const envVars = require('./env.js');
const { user: username, password, env, org, tokenId, tokenSecret } = envVars;
const loc = require('../config/locations.js')
const defaultDir = path.join(os.homedir(), '.edgemicro');
const defaultConfig = path.join(defaultDir,`default.yaml`);
const defaultOrgEnvFilename = `${org}-${env}-config.yaml`;
const defaultSourceConfig = path.join(defaultDir,`${org}-${env}-config.yaml`);
const mgwHome = path.join(loc.defaultDir, '..'); 
const init = require('../cli/lib/init.js');
const configure = require('../cli/lib/configure.js')();
const uuid = require('uuid');

let configDir;
let configLocation;
let customOrgEnvFilepath;

describe('configure module', () => {

	before( (done) => {
		try{
			if(fs.existsSync(defaultSourceConfig)) fs.unlinkSync(defaultSourceConfig);
			done();
		}catch(err){
			console.error(err);
		}
	});

	after( (done) => {
		try{
			let rmConfigLoc = path.join(mgwHome, configLocation);
			if(fs.existsSync(rmConfigLoc)) fs.unlinkSync(rmConfigLoc);
			if(fs.existsSync(customOrgEnvFilepath)) fs.unlinkSync(customOrgEnvFilepath);
			let rmDirPath = path.join(mgwHome, configDir);
			if(fs.existsSync(rmDirPath)) fs.rmdirSync(rmDirPath);
			done();
		}catch(err){
			console.error(err);
		}
	});


	it('returns error msg when specifying a customDir which does not exist',  (done) => {
		configure.configure(
			{
				username,
				org,
				env,
				password,
				configDir: uuid.v1()
			},
			(err, result) => {
				assert.equal("Please call edgemicro init first", err);
				done();
			}
		);
	});

	/*
	it('configures customDir and saves default config file to customDir location',  (done) => {
		configDir = uuid.v1();

		init({configDir},  (err, location) => {
			configLocation = location;
				configure.configure(
					{
						username,
						org,
						env,
						password,
						configDir
					},
					(err, result) =>{
						assert.equal(null, err);
						assert.equal(true, fs.existsSync(location));
						let customSourceConfigJSON = jsyaml.safeLoad(fs.readFileSync(location));
						assert(customSourceConfigJSON.edge_config);
						done();
					}
				);
		});
	});

	it('saves env/org config file to customDir location', (done) =>{
		configDir = uuid.v1();
		customOrgEnvFilepath = path.join(mgwHome, configDir, defaultOrgEnvFilename);
		let customSourceConfigJSON = jsyaml.safeLoad(fs.readFileSync(customOrgEnvFilepath));
		assert(customSourceConfigJSON.edge_config);
		done();
	});
	*/

	/*
	it('configures mgw for org and env without error', done => {
		configure.configure(
			{
				username,
				org,
				env,
				password
			},
			(err, result) => {
				assert.equal(null, err);
				done();
			}
		);
	});

	it('saves env/org config file to default location', (done) => {
		assert.equal(true, fs.existsSync(defaultSourceConfig));
		let defaultSourceConfigJSON = jsyaml.safeLoad(fs.readFileSync(defaultSourceConfig));
		assert(defaultSourceConfigJSON.edge_config);
		done();
	});
	*/


});
