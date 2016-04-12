'use strict';
const path = require('path');
const assert = require('assert');

const edgeconfig = require('microgateway-config');

const configLocations = require('../../config/locations');
const agentConfig = require('../../lib/agent-config');

const Gateway = function () {
}

module.exports = function () {
  return new Gateway();
}

Gateway.prototype.start = function start(options, cb) {
  const that = this;
  const source = configLocations.getSourcePath(options.org, options.env);
  const cache = configLocations.getCachePath(options.org, options.env);

  console.log("starting in non-cluster mode")
  const keys = { key: options.key, secret: options.secret };
  const args = { source: source, target: cache, keys: keys, cluster: options.cluster, processes: options.processes };
  agentConfig(args, function (e, agent) {
    if (e) {
      console.error('edge micro failed to start', e);
      process.exit(1);
    }
    console.log('edge micro started');
    that.agent = agent;
    cb(null, agent);
  });


}

function optionError(message) {
  console.error(message);
  if (this.help) {
    this.help();
  }
}

