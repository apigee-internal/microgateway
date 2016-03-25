'use strict';
const path = require('path');
const os = require('os');


const configDir = path.join(__dirname);
const homeDir =  path.join(os.homedir(), '.edgemicro');
const sourceFile = 'config.yaml';
const defaultFile = 'default.yaml';
const cacheFile =  'cache-config.yaml';
const defaultPath = path.join(configDir,defaultFile);

module.exports = {
  default: defaultPath,
  defaultFile: defaultFile,
  getSourcePath: function getSource(org,env){
    return path.join(homeDir, this.getSourceFile(org,env));
  },
  getSourceFile: function getSourceFile(org,env){
    return org + "-" + env + "-" + sourceFile;
  },
  getCachePath: function getCachePath(org,env){
    return path.join(homeDir, org + "-" + env + "-" + cacheFile);
  },
  initDir: configDir,
  homeDir: homeDir
}