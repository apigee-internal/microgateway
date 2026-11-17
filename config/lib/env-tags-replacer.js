'use strict';

const debug = require('debug')('config:env-tags-replacer');
const CONSOLE_LOG_TAG_COMP = 'microgateway-config env-tags-replacer'

const defaultWriteConsoleLog = function (level, ...data) {
  if (console[level]) {
    console[level](...data);
  }
};

class EnvTagsReplacer {

  constructor(){
    this.writeConsoleLog = defaultWriteConsoleLog;
  }

  /**
   * sets the value to writeConsoleLog
   * @param consoleLogger to use for console logging
   */
  setConsoleLogger(consoleLogger) {
    this.writeConsoleLog = consoleLogger;
  };

   /**
   * replaces the env tags in config by the env values
   * @param config object whose <E></E> tags to be replaced with env values.
   * @param options object which has below properties
   * disableLogs: boolean value, if 'true' console errors and debug logs will not be displayed. 
   */
  replaceEnvTags(config, options={ }){
    const displayLogs = !options.disableLogs;
    try {
      let configStr = JSON.stringify(config);
      let envRegx = /"<E>(?:<n>(?:(?!<\/E>).)+<\/n>|<b>(?:(?!<\/E>).)+<\/b>)<\/E>"|<E>.+?<\/E>/g;
      const numberRegx = /^[0-9]+$/;
      if ( envRegx.test(configStr) ) {
        envRegx.lastIndex = 0;
        configStr = configStr.replace(envRegx, match => {
          const isQuoted = match.startsWith('"');
          const key = isQuoted ? match.slice(1, -1) : match;
          let envKey = key.replace('<E>','').replace('</E>',''); // remove env tags
          let envValueType = 'string';
          if ( isQuoted && envKey.startsWith('<n>') && envKey.endsWith('</n>') ) {
            envValueType = 'number';
            envKey = envKey.replace('<n>','').replace('</n>',''); // remove <n> tags
          } else if ( isQuoted && envKey.startsWith('<b>') && envKey.endsWith('</b>') ) {
            envValueType = 'boolean';
            envKey = envKey.replace('<b>','').replace('</b>',''); // remove <b> tags
          }
          let value = process.env[envKey];
          if ( value ) {
            if ( displayLogs ) {
              debug('Replacing: %s by env value: %s', key, `${value}`);
            }

            switch (envValueType) {
              case 'string':
                return JSON.stringify(String(value)).slice(1, -1);
              case 'number':
                if (numberRegx.test(value)) {
                  return value;
                }
                if (displayLogs) {
                  let err = new Error(`Unsupported env value:${value} for ${envKey}, Supported values for <n> tags are integer`);
                  this.writeConsoleLog('log', { component: CONSOLE_LOG_TAG_COMP }, err);
                }
                return match;
              case 'boolean':
                if (value === 'true' || value === 'false') {
                  return value;
                }
                if (displayLogs) {
                  let err = new Error(`Unsupported env value:${value} for ${envKey}, Supported values for <b> tags are boolean`);
                  this.writeConsoleLog('log', { component: CONSOLE_LOG_TAG_COMP }, err);
                }
                return match;
            }
          } else if ( displayLogs ) {
            let err = new Error('No env variable '+ envKey +' available to replace in config');
            this.writeConsoleLog('log',{component: CONSOLE_LOG_TAG_COMP}, err);
          }
          return match;
        });
        config = JSON.parse(configStr);
      }
    } catch(err) {
      if ( displayLogs ) {
        this.writeConsoleLog('log',{component: CONSOLE_LOG_TAG_COMP},'Error in replacing env tags in the config', err)
      }
    }
    return config;
  }

}

module.exports = EnvTagsReplacer;