'use strict'
const path = require('path');
const fs = require('fs-extra');
const yaml = require('js-yaml');
const assert = require('assert');
const _ = require('lodash');
const EnvTagsReplacer = require('./env-tags-replacer');
let writeConsoleLog = function () {};
const CONSOLE_LOG_TAG_COMP = 'microgateway-config io';

const IO = function (envTagsReplacer) {
  if ( envTagsReplacer ) {
    this.envTagsReplacer = envTagsReplacer;
  } else {
    this.envTagsReplacer = new EnvTagsReplacer();
  }
};

module.exports = function () {
  return new IO();
};

/**
 * initializes the config based on a source config
 * @param options {source,targetDir,targetFile}
 * @param cb function(err,configpath)
 */
IO.prototype.initConfig = function (options, cb) {
  assert(options, 'must have options')
  const source = options.source ? options.source : null;
  assert(source, 'must have source')
  const configDir = options.targetDir ? options.targetDir : null;
  assert(configDir, 'must have configDir')
  const fileName = options.targetFile ? options.targetFile : null;
  assert(fileName, 'must have targetFile')

  const overwrite = options.overwrite;
  const configPath = path.join(configDir, fileName);

  fs.ensureDir(configDir, function (err) {
    //
    if ( err ) writeConsoleLog('error',{component: CONSOLE_LOG_TAG_COMP},err);
    //
    fs.stat(configPath, function (err /*, stats */) {
      if (err) {
        writeConsoleLog('log',{component: CONSOLE_LOG_TAG_COMP},"file doesn't exist, setting up");
        fs.ensureFile(configPath, function (err) {
          if ( err ) writeConsoleLog('error',{component: CONSOLE_LOG_TAG_COMP},err);
          fs.copy(source, configPath, function (err) {
            if ( err ) writeConsoleLog('error',{component: CONSOLE_LOG_TAG_COMP},err);
            return cb(err, configPath);
          }); // copy from default config
        });
      } else {
        // exists, so prompt for overwrite
        fs.copy(source, configPath, {clobber: overwrite}, function (err) {
          if(err) {
            writeConsoleLog('error',{component: CONSOLE_LOG_TAG_COMP},err);
            return cb(err);
          }
          return cb(err,configPath);
        });
      }
    });
  });
}

/**
 * loads config from source config
 * @param options {source,hash=1,0}
 * @returns {*}
 */
IO.prototype.loadSync = function (options) {
  assert(options, 'must have options');
  assert(options.source, 'must have source to load from')
  const source = options.source;
  const hash = options.hash || 0;

  if (!fs.existsSync(source)) {
    writeConsoleLog('error',{component: CONSOLE_LOG_TAG_COMP},'config does not exist', source);
    throw new Error('config does not exist');
  }
  const stat = fs.statSync(source);
  if (!stat.isFile()) {
    writeConsoleLog('error',{component: CONSOLE_LOG_TAG_COMP},'config is not a file', source);
    throw new Error('config is not a file');
  }
  if (stat.size === 0) {
    writeConsoleLog('error',{component: CONSOLE_LOG_TAG_COMP},'config is empty', source);
    throw new Error('config is empty');
  }
  var content;
  try {
    const file = fs.readFileSync(source);
    content = yaml.load(file.toString());
    content._hash = hash; // indicates this is a cached config
  } catch (err) {
    writeConsoleLog('error',{component: CONSOLE_LOG_TAG_COMP},'error reading config from', source, err);
    throw new Error(err);
  }
  if ( !options.keepEnvtags ) {
    content = this.envTagsReplacer.replaceEnvTags(content, options.envTagsReplacerOptions);
  }
  return content;
};

/**
 *
 * @param config to save
 * @param target destination
 */
IO.prototype.saveSync = function (config, target) {
  this.save(config, {target: target, sync: true}, function () {
  });
};

/**
 *
 * @param config to save
 * @param options {sync,target}
 * @param cb function(err){}
 */
IO.prototype.save = function (config, options, cb) {
  assert(options, 'must have options');
  const target = options.target;
  assert(target, 'target is not set');
  options = options || {sync: false}
  const save = {}; // a copy of the config minus event emitter properties
  Object.keys(config).forEach(function (key) {
    if (key.indexOf('_') === 0)
      return; // skip private properties
    save[key] = config[key];
  });
  const dump = yaml.dump(save, { skipInvalid: true });
  if (options.sync) {
    fs.writeFileSync(target, dump);
    if ( _.isFunction(cb) ) cb();
  } else {
    fs.writeFile(target, dump, function (err) {
      if ( err ) writeConsoleLog('error',{component: CONSOLE_LOG_TAG_COMP},'error saving config to', target, err);
      if ( cb && _.isFunction(cb) ) {
        cb(err);
      }
    });
  }
}

/**
 * sets the value to writeConsoleLog
 * @param consoleLogger to use for console logging
 */
IO.prototype.setConsoleLogger = function (consoleLogger) {
  writeConsoleLog = consoleLogger;
  this.envTagsReplacer.setConsoleLogger(writeConsoleLog);
};