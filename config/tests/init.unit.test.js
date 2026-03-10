const path = require('path');
const fs = require('fs');
const assert = require('assert');
const jsyaml = require('js-yaml');
const { init } = require('../index.js');
const fixtureDirectory = path.join(__dirname, 'fixtures');
const fixtureDefaultConfig = path.join(__dirname, 'fixtures', 'default.yaml');
const fixtureDefaultCustomConfig = path.join(__dirname, 'fixtures', 'default-custom.yaml');
const fixtureDefaultConfigMaxConnections = 9001;


describe('config - init', () => {
    after(done => {
        if (fs.existsSync(fixtureDefaultCustomConfig)) fs.unlinkSync(fixtureDefaultCustomConfig);
        done();
    });

    it('initializes custom default source config to custom directory', done => {
        init({
            source: fixtureDefaultConfig,
            targetDir: fixtureDirectory,
            targetFile: 'default-custom.yaml',
            overwrite: true
        }, (err, configPath) => {
            assert.equal(null, err);
            assert.equal(configPath, fixtureDefaultCustomConfig);
            let configPathJSON = jsyaml.load(fs.readFileSync(fixtureDefaultCustomConfig, 'utf8'));
            assert.deepStrictEqual(configPathJSON.edgemicro.max_connections, fixtureDefaultConfigMaxConnections);
            done();
        });
    });
})