const assert = require('assert');
const locations = require('../config/locations');
const init = require('../cli/lib/init');
const fs = require('fs');

describe('configure', () => {
  describe('init module', () => {
    it('will copy file to custom dir', (done) => {
      init({configDir: 'foo'}, (err, file) => {
        assert.equal(file, 'foo/default.yaml');
         
        const fileBuf = fs.readFileSync('config/default.yaml');
        const testBuf = fs.readFileSync(file);
        assert.equal(fileBuf.toString(), testBuf.toString());
        done();
      });
    }); 
    it('will copy file to default dir', () => {
      init({}, (err, file) => {
        console.log(file);
        assert.equal(file, '/Users/apigeelabs/node/microgateway/tests/default.yaml');
         
        const fileBuf = fs.readFileSync('config/default.yaml');
        const testBuf = fs.readFileSync(file);
        assert.equal(fileBuf.toString(), testBuf.toString());
        done();
      });
    });
  });
  describe('locations module', () => {
    it('will build a source path without a configDir', () => {
      var configPath = locations.getSourcePath('test', 'foo');
      //This path differs from the actual config path because we mutate the singleton in other tests.
      assert.equal(configPath, '/Users/apigeelabs/node/microgateway/tests/test-foo-config.yaml');
    });
    it('will build a source path with a configDir', () => {
      var configPath = locations.getSourcePath('test', 'foo', 'foo');
      assert.equal(configPath, 'foo/test-foo-config.yaml');
    });
    it('will build a cache path without a configDir', () => {
      var cachePath = locations.getCachePath('test', 'foo');
      //This path differs from the actual config path because we mutate the singleton in other tests.
      assert.equal(cachePath, '/Users/apigeelabs/node/microgateway/tests/test-foo-cache-config.yaml');
    });
    it('will build a cache path with a configDir', () => {
      var cachePath = locations.getCachePath('test', 'foo', 'foo');
      assert.equal(cachePath, 'foo/test-foo-cache-config.yaml');
    });
  });
});
