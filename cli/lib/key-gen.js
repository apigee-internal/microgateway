'use strict';

const debug = require('debug')('edgemicro');
const async = require('async');
const crypto = require('crypto');
const _ = require('lodash');
const request = require('request');
const url = require('url')
const util = require('util');
const assert = require('assert')
const edgeconfig = require('microgateway-config');
const configLocations = require('../../config/locations');


const KeyGen = function() {

};
KeyGen.prototype.generate = function generate(options, cb) {
  const config = edgeconfig.load({ source: configLocations.getSourcePath(options.org,options.env) });
  this.baseUri = config.edge_config.baseUri;
  this._generate(options, (err, result) => {
    if(err){
      console.error("failed")
      console.error(err)

      cb(err);
    }
    console.info(config.edge_config.bootstrapMessage);
    console.info('  bootstrap:', result.bootstrap);
    console.log();
    console.info(config.edge_config.keySecretMessage);
    console.info('  key:', result.key);
    console.info('  secret:', result.secret);
    console.log();
    console.log('finished');
    cb(err,result)
  });
};

KeyGen.prototype._generate = function _generate(options, cb) {
  assert(_.isFunction(cb));
  assert(options);
  const baseUri = this.baseUri;

  function genkey(callback) {
    const byteLength = 256;
    const hash = crypto.createHash('sha256');
    hash.update(Date.now().toString());
    crypto.randomBytes(byteLength, function(err, buf) {
      if (err) { return callback(err); }

      hash.update(buf);
      hash.update(Date.now().toString());
      callback(null, hash.digest('hex'));
    });
  }

  async.series([
    function(callback) { genkey(callback); }, // generate the key
    function(callback) { genkey(callback); }  // generate the secret
  ], function(err, results) {
    const key = results[0];
    const secret = results[1];
    const keys = {
      key: key,
      secret: secret
    };

    const credentialUrl = util.format(baseUri, 'credential', options.org, options.env);

    debug('sending', JSON.stringify(keys), 'to', credentialUrl);
    request({
      uri: credentialUrl,
      method: 'POST',
      auth: {
        username: options.username,
        password: options.password
      },
      json: keys
    }, function(err, res) {
      err = translateError(err, res);
      if (err) {
        return cb(err);
      }

      if (res.statusCode >= 200 && res.statusCode <= 202) {

        const regionUrl = util.format(baseUri, 'region', options.org, options.env);

        debug('getting region from', regionUrl);
        request({
          uri: regionUrl,
          auth: {   // switch authorization to use the key/secret we just uploaded
            username: key,
            password: secret
          },
          json: true
        }, function(err, res) {
          err = translateError(err, res);
          if (err) {
            return cb(err);
          }
          if (res.statusCode >= 200 && res.statusCode <= 202) {
            if (!res.body.region || !res.body.host) {
              cb(console.error('invalid response from region api', regionUrl, res.text));
              return;
            }

            console.log('configuring host', res.body.host, 'for region', res.body.region);
            const bootstrapUrl = util.format(baseUri, 'bootstrap', options.org, options.env);
            const parsedUrl = url.parse(bootstrapUrl);
            parsedUrl.host = res.body.host; // update to regional host
            const updatedUrl = url.format(parsedUrl); // reconstruct url with updated host


            return cb(null, {
              bootstrap: updatedUrl,
              key: key,
              secret: secret
            });



          } else {

            cb(console.error('error retrieving region for org', res.statusCode, res.text));

          }
        });
      } else {

        cb(console.error('error uploading credentials', res.statusCode, res.text));

      }
    });
  });


}


function translateError(err, res) {
  if (!err && res.statusCode >= 400) {

    var msg = 'cannot ' + res.request.method + ' ' + url.format(res.request.uri) + ' (' + res.statusCode + ')';
    err = new Error(msg);
    err.text = res.body;
    res.error = err;
  }
  return err;
}

module.exports = function() {
  return new KeyGen();
}