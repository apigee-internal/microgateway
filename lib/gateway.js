'use strict'
const gateway = require('microgateway-core')
const plugins = require('./plugins')
module.exports = function init (config) {
  var gatewayInstance = gateway(config)
  var pluginDir = config.edgemicro.plugins.dir
  plugins(gatewayInstance, config).loadPlugins(pluginDir)
  return gatewayInstance
}
