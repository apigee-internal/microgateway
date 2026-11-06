'use strict';

const assert = require('assert');
const path = require('path');

const { load, replaceEnvTags } = require('../index.js');
const fixtureDirectory = path.join(__dirname, 'fixtures');
const defaultOrgEnvFilename = `cached.yaml`;
let customFixtureDirPath = path.join(fixtureDirectory, defaultOrgEnvFilename);
let loadedConfig = load({ source: customFixtureDirPath });


describe('env-tags-replacer module', () => {

    beforeEach((done) => {
        loadedConfig = load({ source: customFixtureDirPath });
        done();
    });

    it('replaces single string env tag', (done) => {
        process.env.UNIT_TESTS_REDIS_HOST = 'localhost';
        loadedConfig.edgemicro.redisHost = "<E>UNIT_TESTS_REDIS_HOST</E>"
        let envReplacedConfig = null;
        try {
            envReplacedConfig = replaceEnvTags(loadedConfig);
        } catch (err) {
            assert.equal(err, null);
        }
        assert.notEqual(envReplacedConfig, null);
        assert.equal(envReplacedConfig.edgemicro.redisHost, process.env.UNIT_TESTS_REDIS_HOST);
        done();
    });

    it('replaces multiple env tags', (done) => {
        process.env.UNIT_TESTS_REDIS_HOST = 'localhost';
        process.env.UNIT_TESTS_REDIS_PASSWORD = 'secret123';
        loadedConfig.edgemicro.redisHost = "<E>UNIT_TESTS_REDIS_HOST</E>"
        loadedConfig.edgemicro.redisPassword = "<E>UNIT_TESTS_REDIS_PASSWORD</E>"
        let envReplacedConfig = null;
        try {
            envReplacedConfig = replaceEnvTags(loadedConfig);
        } catch (err) {
            assert.equal(err, null);
        }
        assert.notEqual(envReplacedConfig, null);
        assert.equal(envReplacedConfig.edgemicro.redisHost, process.env.UNIT_TESTS_REDIS_HOST);
        assert.equal(envReplacedConfig.edgemicro.redisPassword, process.env.UNIT_TESTS_REDIS_PASSWORD);
        done();
    });

    it('replaces multiple definitions of same env tag', (done) => {
        process.env.UNIT_TESTS_EMG_KEY = 'edgemicro_key';
        process.env.UNIT_TESTS_EMG_SECRET = 'secret123';

        if (loadedConfig.quota) {
            Object.keys(loadedConfig.quota).forEach(function(name) {
                const quota = loadedConfig.quota[name];
                quota.key = "<E>UNIT_TESTS_EMG_KEY</E>";
                quota.secret = "<E>UNIT_TESTS_EMG_SECRET</E>";
            });
        }
        let envReplacedConfig = null;
        try {
            envReplacedConfig = replaceEnvTags(loadedConfig);
        } catch (err) {
            assert.equal(err, null);
        }
        assert.notEqual(envReplacedConfig, null);
        if (envReplacedConfig.quota) {
            Object.keys(envReplacedConfig.quota).forEach(function(name) {
                const quota = envReplacedConfig.quota[name];
                assert.equal(quota.key, process.env.UNIT_TESTS_EMG_KEY);
                assert.equal(quota.secret, process.env.UNIT_TESTS_EMG_SECRET);
            });
        }
        done();
    });

    it('replaces env tag in array', (done) => {
        process.env.UNIT_TESTS_PLUGIN_SECURITY = 'oauth';
        
        loadedConfig.edgemicro.plugins.sequence[0] = "<E>UNIT_TESTS_PLUGIN_SECURITY</E>"

        let envReplacedConfig = null;
        try {
            envReplacedConfig = replaceEnvTags(loadedConfig);
        } catch (err) {
            assert.equal(err, null);
        }
        assert.notEqual(envReplacedConfig, null);
        assert.equal(envReplacedConfig.edgemicro.plugins.sequence[0], process.env.UNIT_TESTS_PLUGIN_SECURITY);
        done();
    });

    it('does not replace only with start env tag', (done) => {
        process.env.UNIT_TESTS_REDIS_HOST = 'localhost';
        loadedConfig.edgemicro.redisHost = "<E>UNIT_TESTS_REDIS_HOST"
        let envReplacedConfig = null;
        try {
            envReplacedConfig = replaceEnvTags(loadedConfig);
        } catch (err) {
            assert.equal(err, null);
        }
        assert.notEqual(envReplacedConfig, null);
        assert.equal(envReplacedConfig.edgemicro.redisHost, loadedConfig.edgemicro.redisHost);
        done();
    });

    it('does not replace only with end env tag', (done) => {
        process.env.UNIT_TESTS_REDIS_HOST = 'localhost';
        loadedConfig.edgemicro.redisHost = "UNIT_TESTS_REDIS_HOST</E>"
        let envReplacedConfig = null;
        try {
            envReplacedConfig = replaceEnvTags(loadedConfig);
        } catch (err) {
            assert.equal(err, null);
        }
        assert.notEqual(envReplacedConfig, null);
        assert.equal(envReplacedConfig.edgemicro.redisHost, loadedConfig.edgemicro.redisHost);
        done();
    });

    it('does not throw error if env var is not defined', (done) => {
        loadedConfig.edgemicro.redisHost = "<E>UNIT_TESTS_NO_ENV_VAR</E>"
        let envReplacedConfig = null;
        try {
            envReplacedConfig = replaceEnvTags(loadedConfig);
        } catch (err) {
            assert.equal(err, null);
        }
        assert.notEqual(envReplacedConfig, null);
        assert.equal(envReplacedConfig.edgemicro.redisHost, loadedConfig.edgemicro.redisHost);
        done();
    });

    it('does not replace with invalid env tag', (done) => {
        process.env.UNIT_TESTS_REDIS_HOST = 'localhost';
        loadedConfig.edgemicro.redisHost = "<Env>UNIT_TESTS_REDIS_HOST</Env>"
        let envReplacedConfig = null;
        try {
            envReplacedConfig = replaceEnvTags(loadedConfig);
        } catch (err) {
            assert.equal(err, null);
        }
        assert.notEqual(envReplacedConfig, null);
        assert.equal(envReplacedConfig.edgemicro.redisHost, loadedConfig.edgemicro.redisHost);
        done();
    });

    it('error logs are printed by default', (done) => {
        process.env.UNIT_TESTS_REDIS_HOST = 'localhost';
        loadedConfig.edgemicro.redisHost = "<E>UNIT_TESTS_REDIS_HOS</E>"
        let envReplacedConfig = null;
        let logs = '';
        try {
            var oldWrite = process.stdout.write;
            process.stdout.write = function(chunk, encoding, callback){
                logs += chunk.toString(); // chunk is a String or Buffer
            }
            envReplacedConfig = replaceEnvTags(loadedConfig);
            process.stdout.write = oldWrite;
        } catch (err) {
            assert.equal(err, null);
        }
        assert.notEqual(envReplacedConfig, null);
        assert.equal( logs.includes("No env variable UNIT_TESTS_REDIS_HOS available to replace in config") , true)
        done();
    });

    it('error logs are printed with disableLogs: false', (done) => {
        process.env.UNIT_TESTS_REDIS_HOST = 'localhost';
        loadedConfig.edgemicro.redisHost = "<E>UNIT_TESTS_REDIS_HOS</E>"
        let envReplacedConfig = null;
        let logs = '';
        try {
            var oldWrite = process.stdout.write;
            process.stdout.write = function(chunk, encoding, callback){
                logs += chunk.toString(); // chunk is a String or Buffer
            }
            envReplacedConfig = replaceEnvTags(loadedConfig, { disableLogs: false });
            process.stdout.write = oldWrite;
        } catch (err) {
            assert.equal(err, null);
        }
        assert.notEqual(envReplacedConfig, null);
        assert.equal( logs.includes("No env variable UNIT_TESTS_REDIS_HOS available to replace in config") , true)
        done();
    });

    it('error logs are not printed with disableLogs: true', (done) => {
        process.env.UNIT_TESTS_REDIS_HOST = 'localhost';
        loadedConfig.edgemicro.redisHost = "<E>UNIT_TESTS_REDIS_HOS</E>"
        let envReplacedConfig = null;
        let logs = '';
        try {
            var oldWrite = process.stdout.write;
            process.stdout.write = function(chunk, encoding, callback){
                logs += chunk.toString(); // chunk is a String or Buffer
            }
            envReplacedConfig = replaceEnvTags(loadedConfig, { disableLogs: true });
            process.stdout.write = oldWrite;
        } catch (err) {
            assert.equal(err, null);
        }
        assert.notEqual(envReplacedConfig, null);
        assert.equal( logs.includes("No env variable UNIT_TESTS_REDIS_HOS available to replace in config") , false)
        done();
    });

    it('replaces env value as number with <n> tag', (done) => {
        process.env.UNIT_TESTS_REDIS_PORT = 6379;
        loadedConfig.edgemicro.redisPort = "<E><n>UNIT_TESTS_REDIS_PORT</n></E>"
        let envReplacedConfig = null;
        try {
            envReplacedConfig = replaceEnvTags(loadedConfig);
        } catch (err) {
            assert.equal(err, null);
        }
        assert.notEqual(envReplacedConfig, null);
        assert.equal( typeof envReplacedConfig.edgemicro.redisPort, 'number');
        done();
    });

    it('replaces env value as string without <n> tag', (done) => {
        process.env.UNIT_TESTS_REDIS_PORT = 6379;
        loadedConfig.edgemicro.redisPort = "<E>UNIT_TESTS_REDIS_PORT</E>"
        let envReplacedConfig = null;
        try {
            envReplacedConfig = replaceEnvTags(loadedConfig);
        } catch (err) {
            assert.equal(err, null);
        }
        assert.notEqual(envReplacedConfig, null);
        assert.equal( typeof envReplacedConfig.edgemicro.redisPort, 'string');
        done();
    });

    it('replaces env value as boolean:true with <b> tag', (done) => {
        process.env.UNIT_TESTS_ALLOW_NO_AUTH = true;
        loadedConfig.oauth.allowNoAuthorization = "<E><b>UNIT_TESTS_ALLOW_NO_AUTH</b></E>"
        let envReplacedConfig = null;
        try {
            envReplacedConfig = replaceEnvTags(loadedConfig);
        } catch (err) {
            assert.equal(err, null);
        }
        assert.notEqual(envReplacedConfig, null);
        assert.equal( typeof envReplacedConfig.oauth.allowNoAuthorization, 'boolean');
        done();
    });

    it('replaces env value as boolean:false with <b> tag', (done) => {
        process.env.UNIT_TESTS_ALLOW_NO_AUTH = false;
        loadedConfig.oauth.allowNoAuthorization = "<E><b>UNIT_TESTS_ALLOW_NO_AUTH</b></E>"
        let envReplacedConfig = null;
        try {
            envReplacedConfig = replaceEnvTags(loadedConfig);
        } catch (err) {
            assert.equal(err, null);
        }
        assert.notEqual(envReplacedConfig, null);
        assert.equal( typeof envReplacedConfig.oauth.allowNoAuthorization, 'boolean');
        done();
    });

    it('replaces env value as string without <b> tag', (done) => {
        process.env.UNIT_TESTS_ALLOW_NO_AUTH = true;
        loadedConfig.oauth.allowNoAuthorization = "<E>UNIT_TESTS_ALLOW_NO_AUTH</E>"
        let envReplacedConfig = null;
        try {
            envReplacedConfig = replaceEnvTags(loadedConfig);
        } catch (err) {
            assert.equal(err, null);
        }
        assert.notEqual(envReplacedConfig, null);
        assert.equal( typeof envReplacedConfig.oauth.allowNoAuthorization, 'string');
        done();
    });

    it('does not replaces env value for tags starting with <b> and ending with </n>', (done) => {
        process.env.UNIT_TESTS_ALLOW_NO_AUTH = true;
        loadedConfig.oauth.allowNoAuthorization = "<E><b>UNIT_TESTS_ALLOW_NO_AUTH</n></E>"
        let envReplacedConfig = null;
        try {
            envReplacedConfig = replaceEnvTags(loadedConfig);
        } catch (err) {
            assert.equal(err, null);
        }
        assert.notEqual(envReplacedConfig, null);
        assert.equal( typeof envReplacedConfig.oauth.allowNoAuthorization, 'string');
        done();
    });

    it('does not replaces env value for tags starting with <n> and ending with </b>', (done) => {
        process.env.UNIT_TESTS_REDIS_PORT = 3243;
        loadedConfig.edgemicro.redisPort = "<E><n>UNIT_TESTS_REDIS_PORT</b></E>"
        let envReplacedConfig = null;
        try {
            envReplacedConfig = replaceEnvTags(loadedConfig);
        } catch (err) {
            assert.equal(err, null);
        }
        assert.notEqual(envReplacedConfig, null);
        assert.equal( typeof envReplacedConfig.edgemicro.redisPort, 'string');
        done();
    });

    it('does not replaces env value for tags starting with <b> and ending without </b>', (done) => {
        process.env.UNIT_TESTS_ALLOW_NO_AUTH = true;
        loadedConfig.oauth.allowNoAuthorization = "<E><b>UNIT_TESTS_ALLOW_NO_AUTH</E>"
        let envReplacedConfig = null;
        try {
            envReplacedConfig = replaceEnvTags(loadedConfig);
        } catch (err) {
            assert.equal(err, null);
        }
        assert.notEqual(envReplacedConfig, null);
        assert.equal( typeof envReplacedConfig.oauth.allowNoAuthorization, 'string');
        done();
    });

    it('does not replaces env value for tags starting with <n> and ending without </n>', (done) => {
        process.env.UNIT_TESTS_REDIS_PORT = true;
        loadedConfig.edgemicro.redisPort = "<E><n>UNIT_TESTS_REDIS_PORT</E>"
        let envReplacedConfig = null;
        try {
            envReplacedConfig = replaceEnvTags(loadedConfig);
        } catch (err) {
            assert.equal(err, null);
        }
        assert.notEqual(envReplacedConfig, null);
        assert.equal( typeof envReplacedConfig.edgemicro.redisPort, 'string');
        done();
    });

    it('handles parsing errors', (done) => {
        loadedConfig.edgemicro.circular = loadedConfig;
        let envReplacedConfig = null;
        let logs = '';
        try {
            var oldWrite = process.stdout.write;
            process.stdout.write = function(chunk, encoding, callback){
                logs += chunk.toString(); // chunk is a String or Buffer
            }
            envReplacedConfig = replaceEnvTags(loadedConfig);
            process.stdout.write = oldWrite;
        } catch (err) {
            assert.equal(err, null);
        }
        assert.notEqual(envReplacedConfig, null);
        assert.equal( logs.includes("Error in replacing env tags in the config") , true)
        done();
    });

    it('safely escapes quotes and special characters without JSON injection', (done) => {
        process.env.UNIT_TESTS_SPECIAL_VAL = 'https://x","allowNoAuthorization":true,"pad":"{\t<\\';
        loadedConfig.edgemicro.redisHost = "<E>UNIT_TESTS_SPECIAL_VAL</E>";
        const envReplacedConfig = replaceEnvTags(loadedConfig);
        assert.equal(envReplacedConfig.edgemicro.redisHost, process.env.UNIT_TESTS_SPECIAL_VAL);
        assert.equal(envReplacedConfig.edgemicro.allowNoAuthorization, undefined);
        done();
    });

    it('preserves dollar replacement patterns literally in string env values', (done) => {
        process.env.UNIT_TESTS_DOLLAR_VAL = "my$$secret$&and$'end";
        loadedConfig.edgemicro.redisPassword = "<E>UNIT_TESTS_DOLLAR_VAL</E>";
        const envReplacedConfig = replaceEnvTags(loadedConfig);
        assert.equal(envReplacedConfig.edgemicro.redisPassword, process.env.UNIT_TESTS_DOLLAR_VAL);
        done();
    });

    it('handles unsupported values for <n> tags', (done) => {
        process.env.UNIT_TESTS_REDIS_PORT = 'invalid';
        loadedConfig.edgemicro.redisPort = "<E><n>UNIT_TESTS_REDIS_PORT</n></E>";
        let envReplacedConfig = null;
        let logs = '';
        try {
            var oldWrite = process.stdout.write;
            process.stdout.write = function(chunk, encoding, callback){
                logs += chunk.toString(); // chunk is a String or Buffer
            }
            envReplacedConfig = replaceEnvTags(loadedConfig);
            process.stdout.write = oldWrite;
        } catch (err) {
            assert.equal(err, null);
        }
        assert.notEqual(envReplacedConfig, null);
        assert.equal( logs.includes("Supported values for <n> tags are integer") , true)
        done();
    });


    it('handles unsupported values for <b> tags', (done) => {
        process.env.UNIT_TESTS_ALLOW_NO_AUTH = 'invalid';
        loadedConfig.oauth.allowNoAuthorization = "<E><b>UNIT_TESTS_ALLOW_NO_AUTH</b></E>";
        let envReplacedConfig = null;
        let logs = '';
        try {
            var oldWrite = process.stdout.write;
            process.stdout.write = function(chunk, encoding, callback){
                logs += chunk.toString(); // chunk is a String or Buffer
            }
            envReplacedConfig = replaceEnvTags(loadedConfig);
            process.stdout.write = oldWrite;
        } catch (err) {
            assert.equal(err, null);
        }
        assert.notEqual(envReplacedConfig, null);
        assert.equal( logs.includes("Supported values for <b> tags are boolean") , true)
        done();
    });

    it('throws error for integer env variable inside <b> tags', (done) => {
        process.env.UNIT_TESTS_REDIS_PORT = 1000;
        loadedConfig.oauth.allowNoAuthorization = "<E><b>UNIT_TESTS_REDIS_PORT</b></E>";
        let envReplacedConfig = null;
        let logs = '';
        try {
            var oldWrite = process.stdout.write;
            process.stdout.write = function(chunk, encoding, callback){
                logs += chunk.toString(); // chunk is a String or Buffer
            }
            envReplacedConfig = replaceEnvTags(loadedConfig);
            process.stdout.write = oldWrite;
        } catch (err) {
            assert.equal(err, null);
        }
        assert.notEqual(envReplacedConfig, null);
        assert.equal( logs.includes("Supported values for <b> tags are boolean") , true)
        done();
    });

    it('throws error for boolean env variable inside <n> tags', (done) => {
        process.env.UNIT_TESTS_ALLOW_NO_AUTH = true;
        loadedConfig.oauth.allowNoAuthorization = "<E><n>UNIT_TESTS_ALLOW_NO_AUTH</n></E>";
        let envReplacedConfig = null;
        let logs = '';
        try {
            var oldWrite = process.stdout.write;
            process.stdout.write = function(chunk, encoding, callback){
                logs += chunk.toString(); // chunk is a String or Buffer
            }
            envReplacedConfig = replaceEnvTags(loadedConfig);
            process.stdout.write = oldWrite;
        } catch (err) {
            assert.equal(err, null);
        }
        assert.notEqual(envReplacedConfig, null);
        assert.equal( logs.includes("Supported values for <n> tags are integer") , true)
        done();
    });

});
