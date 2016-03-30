#!/usr/bin/env node
/****************************************************************************
 The MIT License (MIT)

 Copyright (c) 2015 Apigee Corporation

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
 ****************************************************************************/
'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const apigeetool = require('apigeetool');
const util = require('util');
const url = require('url');
const request = require('request');
const debug = require('debug')('edgemicro');
const async = require('async');
const crypto = require('crypto');
const prompt = require('cli-prompt');
const _ = require('lodash');
const parser = new (require('xml2js')).Parser();
const builder = new (require('xml2js')).Builder();
const assert = require('assert');
const cert = require('./cert-lib');
const edgeconfig = require('microgateway-config');
const configLocations = require('../../config/locations');
const deploymentFx = require('./deploy-auth');

const DEFAULT_HOSTS = 'default,secure';

const Private = function() {
};
module.exports = function() {
  return new Private();
};


// begins edgemicro configuration process
Private.prototype.configureEdgemicro = function(options, cb) {
  if (!options.username) {
    return optionError.bind(options)('username is required');
  }
  if (!options.org) {
    return optionError.bind(options)('org is required');
  }
  if (!options.env) {
    return optionError.bind(options)('env is required');
  }
  if (!options.runtimeUrl) {
    return optionError.bind(options)('runtimeUrl is required');
  }
  if (!options.mgmtUrl) {
    return optionError.bind(options)('mgmtUrl is required');
  }

  if (!options.password) {
    return optionError.bind(options)('password is required');
  }

  const cache = configLocations.getCachePath(options.org, options.env);
  console.log('delete cache config');
  const exists = fs.existsSync(cache);
  if (exists) {
    fs.unlinkSync(cache);
    console.log('deleted ' + cache);
  }

  this.sourcePath = configLocations.getSourcePath(options.org, options.env);
  options.proxyName = this.name = 'edgemicro-auth';
  this.basePath = '/edgemicro-auth';
  this.managementUri = options.mgmtUrl;
  this.runtimeUrl = options.runtimeUrl;
  this.virtualHosts = options.virtualHosts || 'default';


  const config = edgeconfig.load({ source: configLocations.getDefaultPath() });

  this.config = config;
  this.authUri = config.edge_config.authUri = this.runtimeUrl + this.basePath;
  this.config.edge_config.managementUri = this.managementUri;
  this.baseUri = this.runtimeUrl + '/edgemicro/%s/organization/%s/environment/%s';
  this.vaultName = config.edge_config.vaultName;
  this.config.edge_config.baseUri = this.baseUri;
  this.deployment = deploymentFx(config.edge_config, this.virtualHosts);

  const that = this;

  edgeconfig.save(that.config, that.sourcePath);
  that.cert = cert(that.config);
  that.checkDeployedProxies(options, (err, options) => {
    if (err) {
      console.error(err);
      cb ? cb(err) : process.exit(1);
      return;
    }
    that.configureEdgemicroWithCreds(options, (err) => {
      if (err) {
        console.error(err);
        cb ? cb(err) : process.exit(1);
        return;
      }
      cb ? cb(err) : process.exit(0)
    });
  });

}

// checks for previously deployed edgemicro proxies
Private.prototype.checkDeployedProxies = function checkDeployedProxies(options, cb) {
  console.log('checking for previously deployed proxies')
  const opts = {
    organization: options.org,
    environment: options.env,
    baseuri: this.managementUri,
    username: options.username,
    password: options.password,
    debug: options.debug
  };
  const that = this;
  apigeetool.listDeployments(opts, function(err, proxies) {
    if (err) {
      return cb(err);
    }

    _.assign(options, proxies);
    cb(err, options)
  })
}

// configures Callout.xml & default.xml of apiproxy being deployed
Private.prototype.configureEdgeMicroInternalProxy = function configureEdgeMicroInternalProxy(options, callback) {
  const that = this;
  const apipath = path.join(__dirname, '..', '..', 'auth', 'apiproxy');
  options.proxyName = 'edgemicro-auth';
  var resPath;
  try {
    resPath = fs.realpathSync(apipath);
  } catch (e) {
    return callback(e);
  }

  const calloutFlow = [
    function(cb) {
      fs.readFile(path.join(resPath, 'policies', 'Callout.xml'), cb);
    },
    function(calloutData, cb) {
      parser.parseString(calloutData, cb);
    },
    function(calloutObj, cb) {
      // change proxy url
      calloutObj.JavaCallout.Properties[0].Property[1]['_'] = 'DN=' + that.runtimeUrl;

      // add management server location
      const mgmtSearch = _.findIndex(calloutObj.JavaCallout.Properties[0].Property, function(prop) {
        return prop['$'].name === 'MGMT_URL_PREFIX';
      });

      if (mgmtSearch === -1) {
        calloutObj.JavaCallout.Properties[0].Property.push({
          '_': that.managementUri,
          '$': {
            name: 'MGMT_URL_PREFIX'
          }
        });
      } else {
        calloutObj.JavaCallout.Properties[0].Property[mgmtSearch]['_'] = that.managementUri;
      }

      // build js obj back into xml
      calloutObj = builder.buildObject(calloutObj)

      // continue with callout as xml
      cb(null, calloutObj);
    },
    function(calloutXml, cb) {
      // write xml back to file
      fs.writeFile(path.join(path.join(resPath, 'policies', 'Callout.xml')), calloutXml, cb);
    }
  ];

  const tasks = [
    function(parallelCb) {
      async.waterfall(calloutFlow, function(err, result) {
        if (err) {
          console.log('error - editing apiproxy Callout.xml');
          return parallelCb(err);
        }

        parallelCb(null, null);
      });
    }
  ];


  // only edit default.xml when virutalHosts is not default
  if (that.virtualHosts !== DEFAULT_HOSTS) {

    const defaultFlow = [
      function(cb) {
        // read defaul xml
        fs.readFile(path.join(resPath, 'proxies', 'default.xml'), cb);
      },
      function(defaultData, cb) {
        // parse default xml into object
        parser.parseString(defaultData, cb);
      },
      function(defaultObj, cb) {
        const vhosts = that.virtualHosts.split(',');

        // edit default obj values
        defaultObj.ProxyEndpoint.HTTPProxyConnection[0].VirtualHost = vhosts;
        // build default object back into xml
        defaultObj = builder.buildObject(defaultObj);

        cb(null, defaultObj);
      },
      function(defaultXml, cb) {
        // write default xml back to file
        fs.writeFile(path.join(resPath, 'proxies', 'default.xml'), defaultXml, cb);
      }
    ];

    tasks.push(function(parallelCb) {
      async.waterfall(defaultFlow, function(err, result) {
        if (err) {
          console.log('error - editing apiproxy default.xml');
          return parallelCb(err);
        }

        parallelCb(null, null);
      });
    });
  }

  // run configuration editing in parallel
  async.parallel(tasks, function(err, results) {
    if (err) {
      return callback(err);
    }

    callback(null, null);
  })
}



// checks deployments, deploys proxies as necessary, checks/installs certs, generates keys
Private.prototype.configureEdgemicroWithCreds = function configureEdgemicroWithCreds(options, cb) {
  const that = this;
  const sourcePath = that.sourcePath;

  const emSearch = _.find(options.deployments, function(proxy) {
    return proxy.name === 'edgemicro-internal';
  });

  const jwtSearch = _.find(options.deployments, function(proxy) {
    return proxy.name === that.name;
  });

  const tasks = [];

  if (!emSearch) {
    tasks.push(function(callback) {
      console.log('configuring edgemicro internal proxy');
      that.configureEdgeMicroInternalProxy(options, callback);
    });

    tasks.push(function(callback) {
      console.log('deploying edgemicro internal proxy');
      that.deployment.deployEdgeMicroInternalProxy(options, callback);
    });
  } else {
    console.log('Proxy edgemicro-internal is already deployed');
  }

  if (!jwtSearch) {
    tasks.push(function(callback) {
      console.log('deploying ', that.name, ' app');
      that.deployment.deployWithLeanPayload(options, callback);
    });
  } else {
    console.log(that.name, ' is already deployed');
  }

  tasks.push(function(callback) {
    console.log('checking org for existing vault');
    that.cert.checkPrivateCert(options, function(err, certs) {
      if (err) {
        that.cert.installPrivateCert(options, callback);
      } else {
        console.log('vault already exists in your org');
        that.cert.retrievePublicKeyPrivate(callback);
      }
    });
  });

  tasks.push(function(callback) {
    console.log('generating keys');
    that.generateKeysWithPassword(options, callback);
  });

  async.series(tasks,
    function(err, results) {
      if (err) {
        return cb(err);
      }

      edgeconfig.init({
        source: configLocations.getDefaultPath(),
        targetDir: configLocations.homeDir,
        targetFile: sourcePath,
        overwrite: true
      },
        function(err,configPath) {
          const agentConfigPath = configPath;
          const agentConfig = that.config = edgeconfig.load({ source: sourcePath });

          if (!emSearch && !jwtSearch) {
            agentConfig['edge_config']['jwt_public_key'] = results[2]; // get deploy results
            agentConfig['edge_config'].bootstrap = results[4]; // get genkeys results
          } else if (emSearch && !jwtSearch) {
            agentConfig['edge_config']['jwt_public_key'] = results[0];
            agentConfig['edge_config'].bootstrap = results[2];
          } else {
            agentConfig['edge_config']['jwt_public_key'] = that.authUri + '/publicKey';
            agentConfig['edge_config'].bootstrap = results[1];
          }

          console.log();
          console.log('saving configuration information to:', agentConfigPath);
          edgeconfig.save(agentConfig, agentConfigPath);
          console.log();

          if (!emSearch && !jwtSearch) {
            console.log('vault info:\n', results[3]);
          } else if (emSearch && !jwtSearch) {
            console.log('vault info:\n', results[1]);
          }

          console.log('edgemicro configuration complete!');
          cb();
        });

    });
};



Private.prototype.generateKeysWithPassword = function generateKeysWithPassword(options, cb) {

  const that = this;
  function genkey(cb) {
    const byteLength = 256;
    const hash = crypto.createHash('sha256');
    hash.update(Date.now().toString());
    crypto.randomBytes(byteLength, function(err, buf) {
      if (err) { return cb(err); }

      hash.update(buf);
      hash.update(Date.now().toString());
      cb(null, hash.digest('hex'));
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

    // first: runtimeUri, second: credential, third: org, fourth: env
    const credentialUrl = util.format(that.baseUri, 'credential', options.org, options.env);

    // NOTE: getting classification failure
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

        const regionUrl = util.format(that.baseUri, 'region', options.org, options.env);

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
            const bootstrapUrl = util.format(that.baseUri, 'bootstrap', options.org, options.env);
            const parsedUrl = url.parse(bootstrapUrl);
            const parsedRes = url.parse(res.body.host);

            parsedUrl.host = parsedRes.host; // update to regional host
            const updatedUrl = url.format(parsedUrl); // reconstruct url with updated host

            console.log();
            console.info(that.config.edge_config.keySecretMessage);
            console.info('  key:', key);
            console.info('  secret:', secret);
            console.log();
            return cb(null, updatedUrl);

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

    const msg = 'cannot ' + res.request.method + ' ' + url.format(res.request.uri) + ' (' + res.statusCode + ')';
    err = new Error(msg);
    err.text = res.body;
    res.error = err;
  }
  return err;
}
function optionError(message) {
  console.error(message);
  this.help();
}

