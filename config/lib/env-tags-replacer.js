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
      let envRegx = RegExp('<E>.+?<\/E>','g');
      let envKeys = configStr.match(envRegx);
      const numberRegx = RegExp('^[0-9]+$','g');
      if ( envKeys && envKeys.length > 0) {
        envKeys.forEach( key => {
          let envKey = key.replace('<E>','').replace('</E>',''); // remove env tags
          let envValueType = 'string';
          if ( envKey.startsWith('<n>') && envKey.endsWith('</n>') ) {
            envValueType = 'number';
            envKey = envKey.replace('<n>','').replace('</n>',''); // remove <n> tags
          } else if ( envKey.startsWith('<b>') && envKey.endsWith('</b>') ) {
            envValueType = 'boolean';
            envKey = envKey.replace('<b>','').replace('</b>',''); // remove <b> tags
          }
          let value = process.env[envKey];
          if ( value ) {
            if ( displayLogs ) {
              debug('Replacing: %s by env value: %s', key, `${value}`);
            }
  
            switch (envValueType) {
              case 'string': {
                const escapedValue = JSON.stringify(String(value)).slice(1, -1);
                configStr = configStr.replace(key, () => escapedValue);
                break;
              }
              case 'number':
                if (value.match(numberRegx)) {
                  configStr = configStr.replace(`"${key}"`, () => value)
                } else {
                  if (displayLogs) {
                    let err = new Error(`Unsupported env value:${value} for ${envKey}, Supported values for <n> tags are integer`);
                    this.writeConsoleLog('log', { component: CONSOLE_LOG_TAG_COMP }, err);
                  }
                }
                break;
              case 'boolean':
                if (value === 'true' || value === 'false') {
                  configStr = configStr.replace(`"${key}"`, () => value)
                } else {
                  if (displayLogs) {
                    let err = new Error(`Unsupported env value:${value} for ${envKey}, Supported values for <b> tags are boolean`);
                    this.writeConsoleLog('log', { component: CONSOLE_LOG_TAG_COMP }, err);
                  }
                }
                break;
            }
          } else {
            if ( displayLogs ) {
              let err = new Error('No env variable '+ envKey +' available to replace in config');
              this.writeConsoleLog('log',{component: CONSOLE_LOG_TAG_COMP}, err);
            }
          }
          config = JSON.parse(configStr);
        })
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