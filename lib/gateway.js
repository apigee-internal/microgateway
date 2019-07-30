'use strict'
const gateway = require('microgateway-core');
const plugins = require('./plugins');

/**
 * returns an instance of the gateway with plugins loaded
 * @param config
 */
module.exports = function init(pluginDir,config) {
  const gatewayInstance = gateway(config)
  if (config.edgemicro.plugins) {
    plugins(gatewayInstance, pluginDir, config).loadPlugins()
  }
  return gatewayInstance
}
