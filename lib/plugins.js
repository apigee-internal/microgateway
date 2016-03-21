'use strict';
const fs = require('fs');
const path = require('path');
const debug = require('debug')('gateway:init');
const util = require('util')
const yaml = require('js-yaml');
const _ = require('lodash');
const assert = require('assert')

/**
 *load plugins into the gateway
 */
var Plugins = function (gateway,config) {
  this.config = config;
  assert(config.edgemicro.plugins, 'plugins not configured');  
  this.gateway = gateway;
};

Plugins.prototype.loadPlugins = function (pluginDir) {
  const config = this.config;

  const gateway = this.gateway;

  if (!pluginDir) {
    pluginDir = _getPluginDirFromConfig(config);
  }
  const pluginDirs = _filterPluginDirectories(pluginDir);

  const sequence = _reorderPlugins(pluginDirs, config);

  sequence.forEach(function (pluginName) {
    var segment = path.join(pluginDir, pluginName);
    // look for the plugins dir one level up from the lib dir (this file's location) if not absolute
    const pluginFullPath = path.isAbsolute(segment)
      ? segment
      : path.resolve(__dirname, path.join('..', segment));
    debug('loading plugin from ' + pluginFullPath);
    const plugin = require(pluginFullPath);
    gateway.addPlugin(pluginName, _.bind(plugin.init,plugin));
  });

}


function _reorderPlugins(dirs, config) {
  var sequence = config.edgemicro.plugins.sequence;

  if (!sequence) {
    throw new Error('plugin sequence not configured');
  }

  if (!Array.isArray(sequence)) {
    throw new Error('invalid plugin sequence: ' + sequence);
  }

  var analytics = 'analytics';
  // ensure analytics is always present and is the first
  if (sequence.indexOf(analytics) < 0) {
    sequence.unshift(analytics); // add first if not configured explicitly
  } else if (sequence[0] !== analytics) { // ensure first if configured explicitly
    throw new Error('analytics must be the first sequenced plugin');
  }

  var reordered = sequence.filter(function (plugin) {
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


const _getPluginDirFromConfig = function (config) {
  var pluginDir;
  assert(config.edgemicro.plugins.dir, 'plugin dir not configured');

  assert(_.isString(config.edgemicro.plugins.dir), 'invalid plugin dir');

  pluginDir = path.normalize(config.edgemicro.plugins.dir);

  assert(fs.existsSync(pluginDir), 'plugin dir does not exist: ' + pluginDir);

  const stat = fs.statSync(pluginDir);
  assert(stat.isDirectory(), 'plugin dir is not a directory: ' + pluginDir);


  return pluginDir;
}

const _filterPluginDirectories = function (pluginDir) {
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
module.exports = function (gateway,config) {
  return new Plugins(gateway,config);
};

