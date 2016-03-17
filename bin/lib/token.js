
'use strict';

const request = require('request');
const util = require('util');
const fs = require('fs');
const path = require('path');
const edgeconfig = require('microgateway-config');
const jwt = require('jsonwebtoken');



const targetDir = path.join(__dirname, '..','..', 'config');

const targetPath = path.join( targetDir, 'cache-config.yaml');

const Token = function(){
  const config = edgeconfig.load({source:targetPath});

  this.managementUri = config['managementUri'];
  this.vaultName = config['vaultName'];
  this.authUri = config['authUri'];

  this.isPublicCloud = this.managementUri === 'https://api.enterprise.apigee.com';

};


Token.prototype.decodeToken = function(options) {

  if (!options.file) { return optionError.bind(this)('file is required'); }

  const jtw = require('../api/helpers/jwt');
  const token = fs.readFileSync(path.resolve(options.file), 'utf8').trim();
  jtw.decode(token, function(err, result) {
    if (err) { return printError(err); }
    console.log(result);
  });
}

Token.prototype.verifyToken = function(options) {
  const authUri = this.authUri;

  if (!options.file) { return optionError.bind(this)('file is required'); }
  if (!options.org) { return optionError.bind(this)('org is required'); }
  if (!options.env) { return optionError.bind(this)('env is required'); }

  const token = fs.readFileSync(path.resolve(options.file), 'utf8').trim();

  getPublicKey(options.org, options.env, authUri, this.isPublicCloud, function(err, certificate) {
    if (err) { return printError(err); }

    const opts = {
      algorithms: ['RS256'],
      ignoreExpiration: false
    };

    jwt.verify(token, certificate, opts, function(err, result) {
      if (err) { return printError(err); }
      console.log(result);
    });
  });
}

Token.prototype.getToken = function(options) {

  const authUri = this.authUri;
  if (!options.org) { return optionError.bind(this)('org is required'); }
  if (!options.env) { return optionError.bind(this)('env is required'); }
  if (!options.id) { return optionError.bind(this)('client id is required'); }
  if (!options.secret) { return optionError.bind(this)('client secret is required'); }

  const uri = this.isPublicCloud ? util.format(authUri + '/token', options.org, options.env) : authUri + '/token';
  const body = {
    client_id: options.id,
    client_secret: options.secret,
    grant_type: 'client_credentials'
  };
  request({
    uri: uri,
    method: 'POST',
    json: body
  }, function(err, res) {
    if (err) { return printError(err) }
    console.log(res.body)
  });
}

function getPublicKey(organization, environment,authUri, isPublicCloud,cb) {

  const uri = isPublicCloud ? util.format(authUri + '/publicKey', organization, environment) : authUri + '/publicKey';
  request({
    uri: uri
  }, function(err, res) {
    if (err) { return cb(err); }
    cb(null, res.body);
  });
}

function printError(err) {
  if (err.response) {
    console.log(err.response.error);
  } else {
    console.log(err);
  }
}

function optionError(message) {
  console.error(message);
  this.help();
}
module.exports = function(){
  return new Token();
}();
