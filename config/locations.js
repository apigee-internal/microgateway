'use strict';
const path = require('path');
const os = require('os');


const configDir = path.join(__dirname);
const homeDir = path.join(os.homedir(), '.edgemicro');
const sourceFile = 'config.yaml';
const defaultFile = 'default.yaml';
const cacheFile = 'cache-config.yaml';
const defaultIPCFileName = 'edgemicro';
const isWin = /^win/.test(process.platform);

module.exports = {
    getInitPath: function(opts) {
        return path.join(configDir, defaultFile);
    },
    getDefaultPath: function(customConfigDir) {
        if (customConfigDir) {
            return path.join(customConfigDir, defaultFile);
        } else {
            return path.join(this.homeDir, defaultFile);
        }
    },
    defaultFile: defaultFile,
    getSourcePath: function getSource(org, env, customConfigDir) {
        if (customConfigDir) {
            return path.join(customConfigDir, this.getSourceFile(org, env));
        } else {
            return path.join(this.homeDir, this.getSourceFile(org, env));
        }
    },
    getSourceFile: function getSourceFile(org, env) {
        return org + '-' + env + '-' + sourceFile;
    },
    getCachePath: function getCachePath(org, env, customConfigDir) {
        if (customConfigDir) {
            return path.join(customConfigDir, org + '-' + env + '-' + cacheFile);
        } else {
            return path.join(this.homeDir, org + '-' + env + '-' + cacheFile);
        }
    },
    getIPCFilePath: function getIPCFilePath() {
        if (!isWin) {
            return path.join(process.cwd(), defaultIPCFileName + '.sock');
        } else {
            return path.join('\\\\?\\pipe', process.cwd(), defaultIPCFileName);
        }
    },
    getPIDFilePath: function getPIDFilePath() {
        return path.join(process.cwd(), defaultIPCFileName + '.pid');
    },
    homeDir: homeDir,
    defaultDir: configDir,
};
