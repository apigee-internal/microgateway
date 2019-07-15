'use strict';

const assert = require('assert');
const cert = require('../cli/lib/cert')();
const denv = require('dotenv');
denv.config();
const envVars = require('./env.js');
const { user: username, password, env, org, tokenId, tokenSecret } = envVars;
const configure = require('../cli/lib/configure.js')();

// before tests edgeconfig configure and install cert

describe('cert module', () => {
	before((done) => {
		configure.configure(
			{
				username,
				org,
				env,
				password
			},
			(err, result) => {
				if (err) console.error(err);
				else done();
			}
		);
	});

	it('checks public cert', done => {
		this.timeout(10000)
		cert.checkCert(
			{
				username,
				org,
				env,
				password
			},
			(err, result) =>{
				assert.equal(null, err);
				// console.log('result-checkCert', result);
				done();
			}
		);
	});

	it('deletes cert', done => {
		cert.deleteCert(
			{
				username,
				org,
				env,
				password
			},
			(err, result) => {
				assert.equal(null, err);
				// console.log('result-deleteCert', result);
				done();
			}
		);
	});

	it('installs cert', done => {
		cert.installCert(
			{
				username,
				org,
				env,
				password
			},
			(err, result) => {
				assert.equal(null, err);
				// console.log('result-installed cert', result);
				done();
			}
		);
	});

	it('retrieves public key', done => {
		cert.retrievePublicKey({ org, env }, (err, result) =>{
			assert.equal(null, err);
			// console.log('publicKey', result);
			done();
		});
	});

	// it('retrieves private(for private installs) public key', done => {
	// 	cert.retrievePublicKeyPrivate({ org, env }, function(err, result) {
	// 		assert.equal(null, err);
	// 		done();
	// 	});
	// });

});
