// const assert = require('assert');
// const locations = require('../config/locations');
// const init = require('../cli/lib/init');
// const fs = require('fs');

// //these are needed to account for the mutation of a singleton pathing module 
// const path = require('path');
// const normalizedPath = path.normalize(__dirname);

// describe('configure', () => {
//   describe('init module', () => {
//     it('will copy file to custom dir', (done) => {
//       init({configDir: 'foo'}, (err, file) => {
//         assert.equal(file, 'foo/default.yaml');
         
//         const fileBuf = fs.readFileSync('config/default.yaml');
//         const testBuf = fs.readFileSync(file);
//         assert.equal(fileBuf.toString(), testBuf.toString());
//         done();
//       });
//     }); 
//     it('will copy file to default dir', () => {
//       init({}, (err, file) => {
//         console.log(file);
//         assert.equal(file, path.join(normalizedPath, 'default.yaml'));
         
//         const fileBuf = fs.readFileSync('config/default.yaml');
//         const testBuf = fs.readFileSync(file);
//         assert.equal(fileBuf.toString(), testBuf.toString());
//         done();
//       });
//     });
//   });
//   describe('locations module', () => {
//     it('will build a source path without a configDir', () => {
//       var configPath = locations.getSourcePath('test', 'foo');
//       //This path differs from the actual config path because we mutate the singleton in other tests.
//       assert.equal(configPath, path.join(normalizedPath, 'test-foo-config.yaml'));
//     });
//     it('will build a source path with a configDir', () => {
//       var configPath = locations.getSourcePath('test', 'foo', 'foo');
//       assert.equal(configPath, 'foo/test-foo-config.yaml');
//     });
//     it('will build a cache path without a configDir', () => {
//       var cachePath = locations.getCachePath('test', 'foo');
//       //This path differs from the actual config path because we mutate the singleton in other tests.
//       assert.equal(cachePath, path.join(normalizedPath, 'test-foo-cache-config.yaml'));
//     });
//     it('will build a cache path with a configDir', () => {
//       var cachePath = locations.getCachePath('test', 'foo', 'foo');
//       assert.equal(cachePath, 'foo/test-foo-cache-config.yaml');
//     });
//     it('will put together a properly named source file', () => {
//       var sourceFile = locations.getSourceFile('test', 'foo');
//       assert.equal(sourceFile, 'test-foo-config.yaml');
//     });
//   });
// });
