"use strict";

const path = require("path");
const assert = require("assert");
const os = require("os");
const locations = require("../config/locations.js");
const configDir = path.join(__dirname, "../config");
const defaultFilename = "default.yaml";
const defaultDirName = '.edgemicro';
const configPath = path.join(__dirname, "../config", defaultFilename);
const denv = require('dotenv');
denv.config();
const envVars = require('./env')


describe("locations module", () => {
	it("provides default directory to save config as (HOME/.edgemicro)", done => {
		const expectedDefaultDir = path.join(os.homedir(), defaultDirName);
		assert.equal(expectedDefaultDir, locations.homeDir);
		done();
	});

	it("provides default saved config filename", function (done) {
		assert.deepStrictEqual(defaultFilename, locations.defaultFile);
		done();
	})

	it('provides default init source directory', done => {
			assert.deepStrictEqual(configDir, locations.defaultDir);
			done();
	});

	it("provides default init source config path", done =>{
		const initPath = locations.getInitPath();
		assert.deepStrictEqual(configPath, initPath);
		done();
	});

	it("provides default directory to save config", done => {
		assert.equal(
			path.join(os.homedir(), defaultDirName, defaultFilename),
			locations.getDefaultPath()
		);
		done();
	});

	it("sets custom directory path ", done => {
		assert.equal(
			path.join("../tests/fixtures", defaultFilename),
			locations.getDefaultPath("../tests/fixtures")
		);
		done();
			//below provides absolute path
			// path.join(configDir,'../tests/fixtures', defaultFilename));
	});


	it("will put together a properly named source file", done => {
		var sourceFile = locations.getSourceFile("test", "foo");
		assert.equal( "test-foo-config.yaml", sourceFile);
		done();
	});

	it("will build a source path without a configDir", done => {
		var configPath = locations.getSourcePath("test", "foo");
		assert.equal(
			path.join(locations.homeDir, "test-foo-config.yaml"),
			configPath
		);
		done();
	});

	it("will build a source path with a configDir", done => {
		var configPath = locations.getSourcePath("test", "foo", "foo");
		assert.equal(configPath, "foo/test-foo-config.yaml");
		done();
	});

	it("will build a cache path without a configDir", done => {
		var cachePath = locations.getCachePath("test", "foo");
		assert.equal(
			cachePath,
			path.join(locations.homeDir, "test-foo-cache-config.yaml")
		);
		done();
	});

	it("will build a cache path with a configDir", done => {
		var cachePath = locations.getCachePath("test", "foo", "foo");
		assert.equal(cachePath, "foo/test-foo-cache-config.yaml");
		done();
	});
});
