"use strict";
const assert = require("assert");
const url = require("url");
const envVars = require("./env.js");
const { user:username, password, env, org, tokenId, tokenSecret} = envVars;
const keygen = require("../cli/lib/key-gen.js")();
const { spawn, spawnSync, execSync } = require("child_process");
const request = require("request");

let newKey = "";
let newSecret = "";

describe("key-gen module", () => {
	it("adds new key/secret", done => {

		keygen.generate(
			{
				username,
				org,
				env,
				password,
			},
			(err, result) => {
				assert.equal(null, err);
				assert.equal(typeof result.key, "string");
				assert.equal(typeof result.secret, "string");
				const bootStrapURL = url.parse(result.bootstrap);
				assert.equal("edgemicroservices.apigee.net", bootStrapURL.host);
				newKey = result.key;
				newSecret = result.secret;

				//try to use newly added key/secret
				setTimeout(() => {
					request.get(
						{
							url: `https://${org}-${env}.apigee.net/edgemicro-auth/products`,
							auth: {
								user: newKey,
								pass: newSecret,
								sendImmediately: true
							}
						},
						(err, resp, body) => {
							assert.equal(null, err);
							assert.equal(200, resp.statusCode);
							done();
						}
					);
				}, 1000);
			}
		);
	});

	it("revokes key/secret", done => {
			let keygenRevoke = spawnSync('node', ['tests/childProcs/keygenRevoke.test.js', newKey, newSecret]);
			let outDataStr = Buffer.from(keygenRevoke.stdout).toString();
			let errDataStr = Buffer.from(keygenRevoke.stderr).toString();
			assert.equal(outDataStr.includes('revoked successfully'), true);

				setTimeout(() => {
					request.get(
						{
							url: `https://${org}-${env}.apigee.net/edgemicro-auth/products`,
							auth: {
								user: newKey,
								pass: newSecret,
								sendImmediately: true
							},
							json: true
						},
						(err, resp, body) => {
							assert.equal(null, err);
							assert.equal(401, resp.statusCode);
							assert.equal("unauthorized", body.error);
							done();
						}
					);
				}, 1000);
	});
});
