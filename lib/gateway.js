'use strict'
const gateway = require('microgateway-core');
const plugins = require('./plugins');

/**
 * returns an instance of the gateway with plugins loaded
 * @param config
 */
module.exports = function init(pluginDir,config) {
  const gatewayInstance = gateway(config)

  config.proxies.forEach((proxy) => {
    plugins(gatewayInstance, pluginDir).loadPlugins(proxy);
  });

  return gatewayInstance
}
