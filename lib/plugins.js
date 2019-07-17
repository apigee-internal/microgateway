'use strict';
const fs = require('fs');
const path = require('path');
const debug = require('debug')('gateway:init');
const _ = require('lodash');
const assert = require('assert');
const builtInPlugins = require('microgateway-plugins');
//const util = require('util')
//const yaml = require('js-yaml');

/**
 *load plugins into the gateway
 */
const Plugins = function (gateway, pluginDir, config) {
  this.config = config;
  assert(config.edgemicro.plugins, 'plugins not configured');
  this.gateway = gateway;
  this.pluginDir = normalizePluginDir(pluginDir) || _getPluginDirFromConfig();
};
function normalizePluginDir(pluginDir) {
  var pluginCandidate = null;
  if (pluginDir) {
    console.log('using pluginDir')
    if (!fs.existsSync(pluginDir)) {
      console.log('pluginDir %s does not exist', pluginDir);
    } else {
      pluginCandidate = path.normalize(pluginDir);
      console.log('using plugin dir %s', pluginCandidate)
    }
  }
  return pluginCandidate;
}
Plugins.prototype.loadPlugins = function () {
  const config = this.config;
  const gateway = this.gateway;
  const builtInPluginKeys = Object.keys(builtInPlugins);
  const pluginDir = this.pluginDir;

  const pluginSubDirs = _getPluginSubDirs(pluginDir);
  const combinedDirs = pluginSubDirs.concat(builtInPluginKeys);
  const sequence = _reorderPlugins(combinedDirs, config);

  sequence.forEach(function (pluginName) {
    const isBuiltIn = builtInPlugins[pluginName];
    let plugin;
    if (!isBuiltIn) {
      const segment = path.join(pluginDir, pluginName);
      // look for the plugins dir one level up from the lib dir (this file's location) if not absolute
      const pluginFullPath = path.isAbsolute(segment) ? segment : path.resolve(__dirname, path.join('..', segment));
      debug('loading plugin from ' + pluginFullPath);
      plugin = require(pluginFullPath);
    } else {
      plugin = isBuiltIn;
    }

    gateway.addPlugin(pluginName, _.bind(plugin.init, plugin));
  });

}


function _reorderPlugins(dirs, config) {
  const analytics = 'analytics';

  const sequence = config.edgemicro.plugins.sequence || [];

  if (!Array.isArray(sequence)) {
    throw new Error('invalid plugin sequence: ' + sequence);
  }

  // ensure analytics is always present and is the first
  if (sequence.indexOf(analytics) < 0) {
    sequence.unshift(analytics); // add first if not configured explicitly
  } else {
    if (sequence[0] !== analytics) { // ensure first if configured explicitly
      throw new Error('analytics must be the first sequenced plugin');
    }
  }

  const reordered = sequence.filter(function (plugin) {
    var index = dirs.indexOf(plugin);
    if (index >= 0) {
      dirs.splice(index, 1);
      return true;
    } else {
      console.warn('sequenced plugin not found:', plugin);
      return false;
    }
  });

  if (dirs.length > 0) {
    debug('ignoring unsequenced plugins:', dirs.join(', '));
  }

  return reordered;
}


const _getPluginDirFromConfig = function () {

  const pluginDir = path.join(__dirname, '..', 'plugins');

  assert(fs.existsSync(pluginDir), 'plugin dir does not exist: ' + pluginDir);

  const stat = fs.statSync(pluginDir);

  assert(stat.isDirectory(), 'plugin dir is not a directory: ' + pluginDir);

  return pluginDir;
}

const _getPluginSubDirs = function (pluginDir) {
  const dirs = fs.readdirSync(pluginDir);

  assert(dirs, 'error reading plugin dir: ' + pluginDir);
  const pluginDirs = dirs.filter(function (dir) {
    const fulldir = path.join(pluginDir, dir);

    // a plugin contains package.json in root
    const pkg = path.join(fulldir, 'package.json');
    if (!fs.existsSync(pkg)) {
      return false;
    }
    const pstat = fs.statSync(pkg);
    if (!pstat.isFile()) {
      return false;
    }

    // a plugin contains index.js in root
    const index = path.join(fulldir, 'index.js');
    if (!fs.existsSync(index)) {
      return false;
    }
    const istat = fs.statSync(index);
    if (!istat.isFile()) {
      return false;
    }

    return true;
  });
  return pluginDirs;
}
module.exports = function (gateway, pluginDir, config) {
  return new Plugins(gateway, pluginDir, config);
};

