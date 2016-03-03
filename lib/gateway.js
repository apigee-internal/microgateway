'use strict';
const gateway = require('edgemicro-gateway');
module.exports = function init(config){
  return gateway(config);
};