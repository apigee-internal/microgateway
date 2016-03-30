'use strict';

const cert = require('./cert-lib')
const edgeconfig = require('microgateway-config');
const prompt = require('cli-prompt');
const path = require('path');
const apigeetool = require('apigeetool');
const _ = require('lodash');
const async = require('async');
const util = require('util');
const configLocations = require('../../config/locations');

const Cert = function() {
};

module.exports = function() {
  return new Cert();
};

Cert.prototype.installCert = function(options, cb) {
  if (!options.username) {
    return optionError.bind(options)('username is required');
  }
  if (!options.org) {
    return optionError.bind(options)('org is required');
  }
  if (!options.env) {
    return optionError.bind(options)('env is required');
  }
  if (!options.password) {
    return optionError.bind(options)('password is required');
  }
  const config = edgeconfig.load({ source: configLocations.getSourcePath(options.org, options.env) });
  cert(config).installCertWithPassword(options, (err, res) => {
    if (err) {
      cb(err)
      return console.error(err, 'failed to update cert')
    }
    console.log('installed cert');
    cb && cb(null,res)
    !cb && process.exit(0);
  });
};

Cert.prototype.checkCert = function(options, cb) {

  if (!options.username) { return optionError.bind(options)('username is required'); }
  if (!options.org) { return optionError.bind(options)('org is required'); }
  if (!options.env) { return optionError.bind(options)('env is required'); }
  if (!options.password) { return optionError.bind(options)('password is required'); }


  const config = edgeconfig.load({ source: configLocations.getSourcePath(options.org, options.env) });
  cert(config).checkCertWithPassword(options, (err, res) => {
    if (err) {
      if(cb){
        return cb(err);
      }
      return console.error(err, 'failed to update cert')
    }
    console.log('checked cert successfully');
    cb && cb(null,res);
    !cb && process.exit(0);    
  });

}

Cert.prototype.deleteCert = function(options,cb) {

  if (!options.username) { return optionError.bind(options)('username is required'); }
  if (!options.org) { return optionError.bind(options)('org is required'); }
  if (!options.env) { return optionError.bind(options)('env is required'); }
  if (!options.password) { return optionError.bind(options)('password is required'); }


  const config = edgeconfig.load({ source: configLocations.getSourcePath(options.org, options.env) });

  cert(config).deleteCertWithPassword(options, function(err, msg) {
    err && console.error(err);
    msg && console.log(msg);
    cb && cb(err,msg);
    !cb && process.exit(0);    
  })

};

Cert.prototype.retrievePublicKey = function(options,cb) {

  if (!options.org) { return optionError.bind(options)('org is required'); }
  if (!options.env) { return optionError.bind(options)('env is required'); }

  const config = edgeconfig.load({ source: configLocations.getSourcePath(options.org, options.env) });
  cert(config).retrievePublicKey(options, (err, certificate) => {
    if (err) {
      cb && cb(err);
      return console.error(err, 'failed to retrieve public key')
    }
    console.log('succeeded');
    console.log(certificate);
    cb(null,certificate);
    !cb && process.exit(0);    
  })
};


Cert.prototype.retrievePublicKeyPrivate = function(options) {

  if (!options.org) { return optionError.bind(options)('org is required'); }
  if (!options.env) { return optionError.bind(options)('env is required'); }

  const config = edgeconfig.load({ source: configLocations.getSourcePath(options.org, options.env) });
  cert(config).retrievePublicKeyPrivate((err, certificate) => {
    if (err) {
      return console.error(err, 'failed to retrieve public key')
    }
    console.log('succeeded');
    console.log(certificate);
  })
}

function optionError(message) {
  console.error(message);
  this.help();
}

function printError(err) {
  if (err.response) {
    console.log(err.response.error);
  } else {
    console.log(err);
  }
}