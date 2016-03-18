'use strict'
const gateway = require('microgateway-core');
const plugins = require('./plugins');

/**
 * returns an instance of the gateway with plugins loaded
 * @param config
 */
module.exports = function init(config) {
  const gatewayInstance = gateway(config)
  if (config.edgemicro.plugins) {
    var pluginDir = config.edgemicro.plugins.dir
    plugins(gatewayInstance, config).loadPlugins(pluginDir)
  }
  return gatewayInstance
}
