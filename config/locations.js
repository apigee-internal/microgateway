'use strict';
const path = require('path');
const os = require('os');


const configDir = path.join(__dirname);
const homeDir =  path.join(os.homedir(), '.edgemicro');
const sourceFile = 'config.yaml';
const defaultFile = 'default.yaml'
const defaultPath = path.join(configDir,defaultFile);
const sourcePath = path.join(homeDir, sourceFile);
const cachePath = path.join(homeDir, 'cache-config.yaml');

module.exports = {
  default: defaultPath,
  source: sourcePath,
  cache: cachePath,
  sourceFile: sourceFile,
  defaultFile: defaultFile,
  initDir: configDir,
  homeDir: homeDir
}