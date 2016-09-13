'use strict';
const path = require('path');
const os = require('os');


const configDir = path.join(__dirname);
const homeDir =  path.join(os.homedir(), '.edgemicro');
const sourceFile = 'config.yaml';
const defaultFile = 'default.yaml';
const cacheFile =  'cache-config.yaml';

module.exports = {
  getInitPath: function(){
     return  path.join(configDir,defaultFile);
  },
  getDefaultPath: function(){
     return  path.join(this.homeDir,defaultFile);
  },
  defaultFile: defaultFile,
  getSourcePath: function getSource(org,env){
    return path.join(this.homeDir, this.getSourceFile(org,env));
  },
  getSourceFile: function getSourceFile(org,env){
    return org + "-" + env + "-" + sourceFile;
  },
  getCachePath: function getCachePath(org,env){
    return path.join(this.homeDir, org + "-" + env + "-" + cacheFile);
  },
  getIPCFilePath: function getIPCFilePath(org, env) {
    return path.join(this.homeDir, org + "-" + env + ".ipc");
  },
  getPidFilePath: function getPidFilePath(org, env) {
    return path.join(this.homeDir, org + "-" + env + ".pid");
  },
  getClusterStatusLogPath: function getClusterStatusLogPath(org, env) {
    return path.join('/var/tmp/', "cluster-"+ org + "-" + env + ".log");
  },
  getConsoleLogPath: function getConsoleLogPath(org, env) {
    return path.join('/var/tmp/', "console-" + org + "-" + env + ".log");
  },
  getErrorLogPath: function getErrorLogPath(org, env) {
    return path.join('/var/tmp/', "error-" + org + "-" + env + ".log");
  },
  defaultDir: configDir,
  homeDir: homeDir
};