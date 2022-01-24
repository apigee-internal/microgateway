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
const writeConsoleLog = require('microgateway-core').Logging.writeConsoleLog;
edgeconfig.setConsoleLogger(writeConsoleLog);

const CONSOLE_LOG_TAG_COMP = 'microgateway key gen';

const KeyGen = function() {

};

KeyGen.prototype.revoke = function(options, cb) {
    const config = edgeconfig.load({
        source: configLocations.getSourcePath(options.org, options.env)
    });

    const baseUri = config.edge_config.baseUri;
    const regionUrl = util.format(baseUri, 'region', options.org, options.env);
    const keys = {
        key: options.key
    };

    debug('getting region from', regionUrl);

    request({
            uri: regionUrl,
            auth: {
              username: options.key,
              password: options.secret
            },
            json: true
        }, function(err, res) {
            err = translateError(err, res);
            if (err) {
				writeConsoleLog('log',{component: CONSOLE_LOG_TAG_COMP},err);
                return cb(err);
            }
            if (res.statusCode >= 200 && res.statusCode <= 202) {
                if (!res.body.region || !res.body.host) {
                    cb(writeConsoleLog('error',{component: CONSOLE_LOG_TAG_COMP},'invalid response from region api', regionUrl, res.text));
                    return;
                } else {
                    const credentialUrl = util.format('https://%s/edgemicro/%s/organization/%s/environment/%s', res.body.host, 'credential', options.org, options.env);
                    debug('sending', JSON.stringify(keys), 'to', credentialUrl);
                    request({
                            uri: credentialUrl,
                            method: 'DELETE',
                            auth: {
                                username: options.username,
                                password: options.password
                            },
                            json: keys
                        }, function(er, re) {
                            er = translateError(er, re);
                            if (er) {
                              writeConsoleLog('log',{component: CONSOLE_LOG_TAG_COMP},er);
                                return cb(er);
                            }
							if (res.statusCode >= 200 && res.statusCode <= 202) {
								writeConsoleLog('log',{component: CONSOLE_LOG_TAG_COMP},"key " + options.key + " revoked successfully");
							} else {
								writeConsoleLog('log',{component: CONSOLE_LOG_TAG_COMP},"revoking key " + options.key + " failed with reason code " + res.StatusCode)
							}
                    });
				}
			}
		});
}

KeyGen.prototype.generate = function generate(options, cb) {
  const config = edgeconfig.load({ source: configLocations.getSourcePath(options.org,options.env) });
  this.baseUri = config.edge_config.baseUri;
  this._generate(options, (err, result) => {
    if(err){
      writeConsoleLog('error',{component: CONSOLE_LOG_TAG_COMP},"failed")
      writeConsoleLog('error',{component: CONSOLE_LOG_TAG_COMP},err)

      cb(err);
    }
    writeConsoleLog('info',{component: CONSOLE_LOG_TAG_COMP},config.edge_config.bootstrapMessage);
    writeConsoleLog('info',{component: CONSOLE_LOG_TAG_COMP},'  bootstrap:', result.bootstrap);
    writeConsoleLog('log',{component: CONSOLE_LOG_TAG_COMP});
    writeConsoleLog('info',{component: CONSOLE_LOG_TAG_COMP},config.edge_config.keySecretMessage);
    writeConsoleLog('info',{component: CONSOLE_LOG_TAG_COMP},'  key:', result.key);
    writeConsoleLog('info',{component: CONSOLE_LOG_TAG_COMP},'  secret:', result.secret);
    writeConsoleLog('log',{component: CONSOLE_LOG_TAG_COMP});
    writeConsoleLog('log',{component: CONSOLE_LOG_TAG_COMP},'finished');
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
      auth: generateCredentialsObject(options),
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
              cb(writeConsoleLog('error',{component: CONSOLE_LOG_TAG_COMP},'invalid response from region api', regionUrl, res.text));
              return;
            }

            writeConsoleLog('log',{component: CONSOLE_LOG_TAG_COMP},'configuring host', res.body.host, 'for region', res.body.region);
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

            cb(writeConsoleLog('error',{component: CONSOLE_LOG_TAG_COMP},'error retrieving region for org', res.statusCode, res.text));

          }
        });
      } else {

        cb(writeConsoleLog('error',{component: CONSOLE_LOG_TAG_COMP},'error uploading credentials', res.statusCode, res.text));

      }
    });
  });


}

function generateCredentialsObject(options) {
    if (options.token) {
        return {
            'bearer': options.token
        };
    } else {
        return {
            user: options.username,
            pass: options.password
        };
    }
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
