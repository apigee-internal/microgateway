'use strict';

const cert = require('./cert-lib')
const edgeconfig = require('microgateway-config');
const util = require('util');
const configLocations = require('../../config/locations');
const assert = require('assert')
//const prompt = require('cli-prompt');
//const path = require('path');
//const apigeetool = require('apigeetool');
//const _ = require('lodash');
//const async = require('async');
const writeConsoleLog = require('microgateway-core').Logging.writeConsoleLog;
edgeconfig.setConsoleLogger(writeConsoleLog);

const Cert = function() {
};

module.exports = function() {
  return new Cert();
};

Cert.prototype.installCert = function(options, cb) {
  if ( !options.username && !options.token ) {
    return  options.error('username is required');
  }
  if ( !options.org ) {
    return  options.error('org is required');
  }
  if ( !options.env ) {
    return  options.error('env is required');
  }
  if ( !options.password && !options.token) {
    return  options.error('password is required');
  }
  const config = edgeconfig.load({ source: configLocations.getSourcePath(options.org, options.env) });
  cert(config).installCertWithPassword(options, (err, res) => {
    if (err) {
      if ( cb ) cb(err);
      return writeConsoleLog('error',  err, 'failed to update cert');
    }
    writeConsoleLog('log','installed cert');
    if ( cb ) cb(null,res);
    if ( !cb ) process.exit(0);
  });
};

Cert.prototype.checkCert = function(options, cb) {

  assert(options.org,"org is required");
  assert(options.env,"env is required")

  assert(options.username || options.token,"username is required");
  assert(options.password || options.token,"password is required")

  const config = edgeconfig.load({ source: configLocations.getSourcePath(options.org, options.env) });
  if (options.url) {
    if (options.url.indexOf('://') === -1) {
      options.url = 'https://' + options.url;
    }
    config.edge_config.authUri = options.url + '/edgemicro-auth';
  } else {
    var newAuthURI = util.format(config.edge_config.authUri, options.org, options.env);
    config.edge_config.authUri = newAuthURI;
  }

  cert(config).checkCertWithPassword(options, (err, res) => {
    if ( err ) {
      if ( cb ) {
        return cb(err);
      }
      return writeConsoleLog('error',  err, 'failed to update cert')
    }
    writeConsoleLog('log','checked cert successfully');
    if ( cb ) cb(null,res);
    if ( !cb ) process.exit(0);
  });

}

Cert.prototype.deleteCert = function(options,cb) {

  assert(options.org,"org is required");
  assert(options.env,"env is required")

  assert(options.username || options.token,"username is required");
  assert(options.password || options.token,"password is required")



  const config = edgeconfig.load({ source: configLocations.getSourcePath(options.org, options.env) });

  cert(config).deleteCertWithPassword(options, function(err, msg) {
    if ( err ) writeConsoleLog('error',  err);
    if ( msg ) writeConsoleLog('log',msg);
    if ( cb ) cb(err,msg);
    if ( !cb ) process.exit(0);
  })

};

Cert.prototype.retrievePublicKey = function(options,cb) {

 assert(options.org,"org is required");
 assert(options.env,"env is required")

  const config = edgeconfig.load({ source: configLocations.getSourcePath(options.org, options.env) });
  if (options.url) {
    if (options.url.indexOf('://') === -1) {
      options.url = 'https://' + options.url;
    }
    config.edge_config.authUri = options.url + '/edgemicro-auth';
  } else {
    var newAuthURI = util.format(config.edge_config.authUri, options.org, options.env);
    config.edge_config.authUri = newAuthURI;
  }
  cert(config).retrievePublicKey(options, (err, certificate) => {
    if (err) {
      if ( cb ) cb(err);
      return writeConsoleLog('error',  err, 'failed to retrieve public key')
    }
    writeConsoleLog('log', 'succeeded');
    writeConsoleLog('log', certificate);
    if ( cb ) cb(null,certificate);
    if ( !cb ) process.exit(0);
  })
};


Cert.prototype.retrievePublicKeyPrivate = function(options) {

  assert(options.org,"org is required");
  assert(options.env,"env is required")

  const config = edgeconfig.load({ source: configLocations.getSourcePath(options.org, options.env) });
  cert(config).retrievePublicKeyPrivate((err, certificate) => {
    if (err) {
      return writeConsoleLog('error',  err, 'failed to retrieve public key')
    }
    writeConsoleLog('log','succeeded');
    writeConsoleLog('log', certificate);
  })
}

/*
function optionError(message) {
  writeConsoleLog('error',message);
  this.help();
}

function printError(err) {
  if (err.response) {
    writeConsoleLog('log',err.response.error);
  } else {
    writeConsoleLog('log',err);
  }
}
*/
