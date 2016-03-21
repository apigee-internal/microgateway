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

var fs = require('fs');
var path = require('path');
var yaml = require('js-yaml');
var apigeetool = require('apigeetool');
var util = require('util');
var url = require('url');
var request = require('request');
var debug = require('debug')('edgemicro');
var async = require('async');
var crypto = require('crypto');
var prompt = require('cli-prompt');
var _ = require('lodash');
var parser = new (require('xml2js')).Parser();
var builder = new (require('xml2js')).Builder();
var assert = require('assert');
var cert = require('./em-cert-logic');
var tmp = require('tmp');
var rimraf = require('rimraf');
var mkdirp = require('mkdirp');
var cpr = require('cpr');
var edgeconfig = require('edgeconfig');

var DEFAULT_HOSTS = 'default,secure';
var config = yaml.safeLoad(fs.readFileSync(path.resolve(__dirname, '../config/default.yaml')).toString());
var vaultName = config['vaultName'];
var managementUri;
var authUri;
var agentConfigPath = path.join(__dirname, '../../agent/config/default.yaml');

var EXTRA_MODULES = ['apigeetool', 'cli-prompt', 'commander', 'cpr', 'mkdirp', 'rimraf', 'should', 'supertest', 'tmp', 'xml2js'];

var privateLogic =  function(){

};



// begins edgemicro configuration process
privateLogic.prototype.configureEdgemicro = function(options) {
  if (!options.username) { return optionError.bind(this)('username is required'); }
  if (!options.org) { return optionError.bind(this)('org is required'); }
  if (!options.env) { return optionError.bind(this)('env is required'); }
  if (!options.runtimeUrl) { return optionError.bind(this)('runtimeUrl is required'); }
  if (!options.mgmtUrl) { return optionError.bind(this)('mgmtUrl is required'); }

  if (!options.virtualHosts) {
    options.virtualHosts = 'default';
  }

  promptForPassword('org admin password: ', options, setEdgeMicroDefaults);
}

// backs-up default.yaml, then writes new deployment info
function setEdgeMicroDefaults(options) {
  var backupName = 'default.yaml.bak';
  options.name = 'edgemicro-auth';
  options.basePath = '/edgemicro-auth';

  fs.writeFile(path.resolve(__dirname, '../config', backupName), yaml.safeDump(config), function(err) {
    if (err) { return printError(err); }

    managementUri = config.managementUri = options.mgmtUrl;
    authUri = config.authUri = options.runtimeUrl + options.basePath;
    config.baseUri = options.runtimeUrl + '/edgemicro/%s/organization/%s/environment/%s';

    try {
      fs.writeFileSync(path.resolve(__dirname, '../config/default.yaml'), yaml.safeDump(config));
    } catch(e) {
      return printError(e);
    }

    checkDeployedProxies(options);
  });
}

// checks for previously deployed edgemicro proxies
function checkDeployedProxies(options) {
  console.log();
  console.log('checking for previously deployed proxies')
  var opts = {
    organization: options.org,
    environment: options.env,
    baseuri: managementUri,
    username: options.username,
    password: options.password,
    debug: options.debug
  }

  apigeetool.listDeployments(opts, function(err, proxies) {
    if (err) { return printError(err); }

    _.assign(options, proxies);
    configureEdgemicroWithCreds(options);
  })
}

// configures Callout.xml & default.xml of apiproxy being deployed
function configureEdgeMicroInternalProxy(options, callback) {
  var apipath = path.join(__dirname, 'apiproxy');
  var resPath;
  try {
    resPath = fs.realpathSync(apipath);
  } catch(e) {
    return callback(e);
  }

  var calloutFlow = [
    function(cb) {
      fs.readFile(path.join(resPath, 'policies', 'Callout.xml'), cb);
    },
    function(calloutData, cb) {
      parser.parseString(calloutData, cb);
    },
    function(calloutObj, cb) {
      // change proxy url
      calloutObj.JavaCallout.Properties[0].Property[1]['_'] = 'DN='+options.runtimeUrl;

      // add management server location
      var mgmtSearch = _.findIndex(calloutObj.JavaCallout.Properties[0].Property, function(prop) {
        return prop['$'].name === 'MGMT_URL_PREFIX';
      });

      if (mgmtSearch === -1) {
        calloutObj.JavaCallout.Properties[0].Property.push({
          '_': managementUri,
          '$': {
            name: 'MGMT_URL_PREFIX'
          }
        });
      } else {
        calloutObj.JavaCallout.Properties[0].Property[mgmtSearch]['_'] = managementUri;
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

  var tasks = [
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
  if (options.virtualHosts !== DEFAULT_HOSTS) {

    var defaultFlow = [
      function(cb) {
        // read defaul xml
        fs.readFile(path.join(resPath, 'proxies', 'default.xml'), cb);
      },
      function(defaultData, cb) {
        // parse default xml into object
        parser.parseString(defaultData, cb);
      },
      function(defaultObj, cb) {
        var vhosts = options.virtualHosts.split(',');

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

// deploys internal apiproxy to specified managementUrl
function deployEdgeMicroInternalProxy(options, callback) {
  var opts = {
    organization: options.org,
    environments: options.env,
    baseuri: managementUri,
    username: options.username,
    password: options.password,
    debug: options.debug,
    verbose: options.debug,
    api: 'edgemicro-internal',
    directory: __dirname,
    'import-only': false,
    'resolve-modules': false,
    virtualhosts: options.virtualHosts || 'default'
  };

  apigeetool.deployProxy(opts, function(err, res) {
    if (err) {
      return callback(err);
    }

    callback(null, res);
  });
}

// checks deployments, deploys proxies as necessary, checks/installs certs, generates keys
function configureEdgemicroWithCreds(options) {
  var emSearch = _.find(options.deployments, function(proxy) {
    return proxy.name === 'edgemicro-internal';
  });

  var jwtSearch = _.find(options.deployments, function(proxy) {
    return proxy.name === options.name;
  });

  var tasks = [];

  if (!emSearch) {
    tasks.push(function(callback) {
      console.log('configuring edgemicro internal proxy');
      configureEdgeMicroInternalProxy(options, callback);
    });

    tasks.push(function(callback) {
      console.log('deploying edgemicro internal proxy');
      deployEdgeMicroInternalProxy(options, callback);
    });
  } else {
    console.log('Proxy edgemicro-internal is already deployed');
  }

  if (!jwtSearch) {
    tasks.push(function(callback) {
      console.log('deploying ', options.name, ' app');
      deployWithLeanPayload(options, callback);
    });
  } else {
    console.log(options.name, ' is already deployed');
  }

  tasks.push(function(callback) {
    console.log('checking org for existing vault');
    cert.checkPrivateCert(options, function(err, certs){
      if (err) {
        cert.installPrivateCert(options, callback);
      } else {
        console.log('vault already exists in your org');
        cert.retrievePublicKeyPrivate(options, callback);
      }
    });
  });

  tasks.push(function(callback) {
    console.log('generating keys');
    generateKeysWithPassword(options, callback);
  });

  async.series(tasks,
    function(err, results) {
      if (err) {
        return printError(err);
      }

      var defaultConfigPath = path.join(__dirname, '..', '..', 'agent', 'config', 'default.yaml');
      var targetFile = 'config.yaml';
      var alternate = 'new-config.yaml';

      var targetDir = path.join(os.homedir(), '.edgemicro');
      var overwriteFn = function (prompt_message, answer_cb) {
        console.log();
        prompt(prompt_message, answer_cb);
      };

      var promptCb = function(overwrite) {
        edgeconfig.init({
            source: defaultConfigPath,
            targetDir: targetDir,
            targetFile: overwrite ? targetFile : alternateFile,
            overwrite:overwrite
          },
          function (configPath) {
            agentConfigPath = configPath;
            var agentConfig = edgeconfig.load();

            if (!emSearch && !jwtSearch) {
              agentConfig['edge_config']['jwt_public_key'] = results[2]; // get deploy results
              agentConfig['edge_config'].bootstrap = results[4]; // get genkeys results
            } else if (emSearch && !jwtSearch) {
              agentConfig['edge_config']['jwt_public_key'] = results[0];
              agentConfig['edge_config'].bootstrap = results[2];
            } else {
              agentConfig['edge_config']['jwt_public_key'] = authUri + '/publicKey';
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

            console.log();
            console.log('edgemicro configuration complete!');
          });
      };
      overwriteFn('overwrite exisiting configuration? (y/n) ', function (ans) {
        ans = ans.match(/^(yes|ok|true|y)$/i) ? true : false;
        promptCb(ans)
      });
    });
};

function deployWithLeanPayload(options, callback) {
  var tmpDir = tmp.dirSync({keep: true, dir: path.resolve(__dirname, '..', '..')});
  var tasks = [];

  // copy bin folder into tmp
  tasks.push(function(cb) {
    console.log('preparing edgemicro-auth app to be deployed to your Edge instance');
    cpr(path.resolve(__dirname, '..'), tmpDir.name, cb);
  });

  // delete bin
  tasks.push(function(cb) {
    rimraf(path.join(tmpDir.name, 'bin'), cb);
  });

  // delete lib
  tasks.push(function(cb) {
    rimraf(path.join(tmpDir.name, 'lib'), cb);
  });

  // delete tests
  tasks.push(function(cb) {
    rimraf(path.join(tmpDir.name, 'test'), cb);
  });

  // delete extraneous node modules
  tasks.push(function(cb) {
    async.each(EXTRA_MODULES, function(mod, eachCb) {
        rimraf(path.join(tmpDir.name, 'node_modules', mod), eachCb);
      },
      function(err) {
        if (err) { return cb(err); }

        return cb(null);
      });
  });

  // deploy lean payload
  tasks.push(function(cb) {
    options.dir = tmpDir.name;
    deployProxyWithPassword(options, cb);
  });

  // delete tmp dir
  tasks.push(function(cb) {
    rimraf(tmpDir.name, cb);
  })

  async.series(tasks, function(err, res) {
    if (err) { return callback(err); }

    callback(null, res[3]);
  })
}

// deploy JWT app
function deployProxyWithPassword(options, callback) {
  var opts = {
    organization: options.org,
    environments: options.env,
    baseuri: managementUri,
    username: options.username,
    password: options.password,
    debug: options.debug,
    verbose: options.debug,
    api: options.name,
    main: 'app.js',
    directory: options.dir ? options.dir : path.resolve(__dirname, '..'),
    'base-path': options.basePath,
    'import-only': false,
    'resolve-modules': false,
    virtualhosts: options.virtualHosts || 'default'
  };

  console.log('Give me a minute or two... this can take a while...');

  apigeetool.deployNodeApp(opts, function(err) {
    if (err) {
      if (err.code === 'ECONNRESET' && err.message === 'socket hang up') {
        err.message = 'Deployment timeout. Please try again or use the --upload option.'
      } else if (err.message === 'Get API info returned status 401') {
        err.message = 'Invalid credentials. Please correct and try again.'
      }

      if (callback) {
        return callback(err);
      } else {
        return printError(err);
      }
    }

    console.log('App %s added to your org. Now adding resources.', options.name);
    opts.password = options.password; // override a apigeetool side-effect bug
    installJavaCallout(opts, function(err) {
      if (err) {
        if (callback) {
          return callback(err);
        } else {
          return printError(err);
        }
      }

      console.log('App %s deployed.', options.name);
      if (callback) {
        callback(null, authUri + '/publicKey')
      } else {
        console.log();
        console.log('Please copy following property to your edgemicro config:');
        console.log('jwt_public_key: ' + authUri + '/publicKey');
      }
    });
  });
}

function installJavaCallout(opts, cb) {

  var jarName = 'micro-gateway-products-javacallout-1.0.0.jar';
  // todo: revision?
  var addResourceUri = '%s/v1/organizations/%s/apis/%s/revisions/1/resources?name=%s&type=java';
  var uri = util.format(addResourceUri, managementUri, opts.organization, opts.api, jarName);

  var httpReq = request({
    uri: uri,
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    auth: {
      username: opts.username,
      password: opts.password
    }
  }, function(err, res) {
    err = translateError(err, res);
    if (err) { return cb(err); }

    var addStepDefinitionUri = '%s/v1/organizations/%s/apis/%s/revisions/1/stepdefinitions';
    uri = util.format(addStepDefinitionUri, managementUri, opts.organization, opts.api);
    var data = '<JavaCallout name=\'JavaCallout\'><ResourceURL>java://%s</ResourceURL><ClassName>io.apigee.microgateway.javacallout.Callout</ClassName></JavaCallout>';

    request({
      uri: uri,
      method: 'POST',
      headers: { 'Content-Type': 'application/xml' },
      auth: {
        username: opts.username,
        password: opts.password
      },
      body: util.format(data, jarName)
    }, function(err) {
      if (err) { return cb(err); }

      var addStepUri = '%s/v1/organizations/%s/apis/%s/revisions/1/proxies/default/steps?name=JavaCallout&flow=PostFlow&enforcement=response';
      uri = util.format(addStepUri, managementUri, opts.organization, opts.api);

      request({
        uri: uri,
        method: 'POST',
        auth: {
          username: opts.username,
          password: opts.password
        }
      }, function(err, res) {
        cb(err, res)
      });
    });
  });

  var fileStream = fs.createReadStream(path.resolve(__dirname, jarName));
  fileStream.pipe(httpReq);
}

function generateKeysWithPassword(options, continuation) {

  function genkey(cb) {
    var byteLength = 256;
    var hash = crypto.createHash('sha256');
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
    var key = results[0];
    var secret = results[1];
    var keys = {
      key: key,
      secret: secret
    };

    // first: runtimeUri, second: credential, third: org, fourth: env
    var credentialUrl = util.format(config.baseUri, 'credential', options.org, options.env);

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
        if (continuation) {
          return continuation(err);
        } else {
          return printError(err);
        }
      }

      if (res.statusCode >= 200 && res.statusCode <= 202) {

        var regionUrl = util.format(config.baseUri, 'region', options.org, options.env);

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
            if (continuation) {
              return continuation(err);
            } else {
              return printError(err);
            }
          }

          if (res.statusCode >= 200 && res.statusCode <= 202) {
            if (!res.body.region || !res.body.host) {
              if (continuation) {
                continuation(console.error('invalid response from region api', regionUrl, res.text));
              } else {
                console.error('invalid response from region api', regionUrl, res.text);
              }

              return;
            }

            console.log('configuring host', res.body.host, 'for region', res.body.region);
            var bootstrapUrl = util.format(config.baseUri, 'bootstrap', options.org, options.env);
            var parsedUrl = url.parse(bootstrapUrl);
            var parsedRes = url.parse(res.body.host);

            parsedUrl.host = parsedRes.host; // update to regional host
            var updatedUrl = url.format(parsedUrl); // reconstruct url with updated host

            if (continuation) {
              console.log();
              console.info(config.keySecretMessage);
              console.info('  key:', key);
              console.info('  secret:', secret);
              console.log();
              return continuation(null, updatedUrl);
            } else {
              console.info(config.bootstrapMessage);
              console.info('  bootstrap:', updatedUrl);
            }
            console.log();

            console.log();
            console.info(config.keySecretMessage);
            console.info('  key:', key);
            console.info('  secret:', secret);
            console.log();

          } else {
            if (continuation) {
              continuation(console.error('error retrieving region for org', res.statusCode, res.text));
            } else {
              console.error('error retrieving region for org', res.statusCode, res.text);
            }
          }
        });
      } else {
        if (continuation) {
          continuation(console.error('error uploading credentials', res.statusCode, res.text));
        } else {
          console.error('error uploading credentials', res.statusCode, res.text);
        }
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

// prompt for a password if it is not specified
function promptForPassword(message, options, continuation) {
  if (options.password) {
    continuation(options);
  } else {
    prompt.password(message, function(pw) {
      options.password = pw;
      continuation(options);
    });
  }
}
module.exports = function(){
  return new privateLogic();
};
