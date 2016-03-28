'use strict';

const edgeconfig = require('microgateway-config')
const prompt = require('cli-prompt');
const path = require('path');
const apigeetool = require('apigeetool');
const _ = require('lodash');
const async = require('async')
const util = require('util')
const fs = require('fs')
const tmp = require('tmp')
const cpr = require('cpr')
const rimraf = require('rimraf')
const request = require('request');
const assert = require('assert');
const DEFAULT_HOSTS = 'default,secure';

const EXTRA_MODULES = ['apigeetool', 'cli-prompt', 'commander', 'cpr', 'mkdirp', 'rimraf', 'should', 'supertest', 'tmp', 'xml2js'];

const configLocations = require('../../config/locations');

const defaultConfig = edgeconfig.load({ source: configLocations.getDefaultPath() });

const cert = require('./cert')(defaultConfig)

module.exports = function configure(options,cb) {
  if (!options.username) { return optionError.bind(options)('username is required'); }
  if (!options.org) { return optionError.bind(options)('org is required'); }
  if (!options.env) { return optionError.bind(options)('env is required'); }
  promptForPassword('org admin password: ', options, checkDeployedProxies,cb);
};


function checkDeployedProxies(options,cb) {
  const cache = configLocations.getCachePath(options.org,options.env);
  console.log('delete cache config');
  const exists = fs.existsSync(cache);
  if (exists) {
    fs.unlinkSync(cache);
    console.log('deleted ' + cache);
  }

  console.log();
  console.log('checking for previously deployed proxies')
  const opts = {
    organization: options.org,
    environments: options.env,
    environment: options.env,
    baseuri: defaultConfig.edge_config['managementUri'],
    username: options.username,
    password: options.password,
    debug: options.debug,
    overwrite: true
  }

  apigeetool.listDeployments(opts, function(err, proxies) {
    if (err) { return printError(err); }

    _.assign(options, proxies);
    configureEdgemicroWithCreds(options,cb);
  })
}

function configureEdgemicroWithCreds(options,cb) {
  var tasks = [], authUri, agentConfigPath;

  options.proxyName = 'edgemicro-auth';

  if (options.url) {
    if (options.url.indexOf('://') === -1) {
      options.url = 'https://' + options.url;
    }
    authUri = options.url + '/edgemicro-auth';
  } else {
    authUri = defaultConfig.edge_config.authUri
  }

  const jwtSearch = _.find(options.deployments, function(proxy) {
    return proxy.name === options.proxyName;
  });

  if (!jwtSearch) {
    tasks.push(function(callback) {
      deployWithLeanPayload(options, callback);
    });
  } else {
    console.log('App ', options.proxyName, ' is already deployed!');
  }

  tasks.push(
    function(callback) {
      console.log('checking org for existing vault');
      cert.checkCertWithPassword(options, function(err, certs) {
        if (err) {
          cert.installCertWithPassword(options, callback);
        } else {
          console.log('vault already exists in your org');
          cert.retrievePublicKey(options, callback);
        }
      });
    }
  );

  tasks.push(
    function(callback) {
      cert.generateKeysWithPassword(options, callback);
    }
  );

  async.series(tasks, function(err, results) {
    if (err) {
      return printError(err);
    }

    console.log('updating agent configuration');
    const targetFile = configLocations.getSourceFile(options.org,options.env);
    edgeconfig.init({
      source: configLocations.getDefaultPath(),
      targetDir: configLocations.homeDir,
      targetFile: targetFile,
      overwrite: true
    }, function(err, configPath) {
      if (err) {
        process.exit(1)
      }
      agentConfigPath = configPath;
      const agentConfig = edgeconfig.load({ source: configPath });

      if (!jwtSearch) {
        agentConfig['edge_config']['jwt_public_key'] = results[0]; // get deploy results
        agentConfig['edge_config'].bootstrap = results[2].bootstrap; // get genkeys results
      } else {
        agentConfig['edge_config']['jwt_public_key'] =
          options.url ? authUri + '/publicKey' : util.format(authUri + '/publicKey', options.org, options.env);
        agentConfig['edge_config'].bootstrap = results[1].bootstrap;
      }

      console.log();
      console.log('saving configuration information to:', agentConfigPath);
      edgeconfig.save(agentConfig, agentConfigPath); // if it didn't throw, save succeeded
      console.log();

      if (jwtSearch) {
        console.log('vault info:\n', results[0]);
      } else {
        console.log('vault info:\n', results[1]);
      }
      console.log();

      console.info(defaultConfig.edge_config.keySecretMessage);
      console.info('  key:', results[2] ? results[2].key : results[1].key);
      console.info('  secret:', results[2] ? results[2].secret : results[1].secret);
      console.log();

      console.log('edgemicro configuration complete!');
      if(_.isFunction(cb)){
        cb();
      }else{
        process.exit(0)        
      }
    });
  });
}

function deployWithLeanPayload(options, callback) {
  var tmpDir = tmp.dirSync({keep: true, dir: path.resolve(__dirname, '..', '..')});
  var tasks = [];
  var deployResultNdx = 5; // if files are added to exclusion this might need changing

  // copy bin folder into tmp
  tasks.push(function(cb) {
    console.log('preparing edgemicro-auth app to be deployed to your Edge instance');
    cpr(path.resolve(__dirname, '..','..','auth','app'), tmpDir.name, cb);
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
    const dir = tmpDir.name;
    deployProxyWithPassword(options,dir, cb);
  });

  // delete tmp dir
  tasks.push(function(cb) {
    rimraf(tmpDir.name, cb);
  })

  async.series(tasks, function(err, results) {
    if (err) { return callback(err); }

    // pass JWT public key URL through callback
    callback(null, results[deployResultNdx]);
  })
}

function deployProxyWithPassword(options, dir, callback) {
  const authUri =  defaultConfig.edge_config['authUri'];
  assert(dir, 'dir must be configured')
  assert(callback,'callback must be present')
  const managementUri =  defaultConfig.edge_config['managementUri'];
  var opts = {
    organization: options.org,
    environments: options.env,
    baseuri: managementUri,
    username: options.username,
    password: options.password,
    debug: options.debug,
    verbose: options.debug,
    api: options.proxyName,
    main: 'app.js',
    directory: dir,
    'base-path': '/edgemicro-auth',
    'import-only': false,
    'resolve-modules': false,
    virtualhosts: options.virtualHosts || 'default,secure'
  };

  console.log('Give me a minute or two... this can take a while...');
  apigeetool.deployNodeApp(opts, function(err) {
    if (err) {
      if (err.code === 'ECONNRESET' && err.message === 'socket hang up') {
        err.message = 'Deployment timeout. Please try again or use the --upload option.'
      } else if (err.message === 'Get API info returned status 401') {
        err.message = 'Invalid credentials or not sufficient permission. Please correct and try again.'
      }

      if (callback) {
        return callback(err);
      } else {
        return printError(err);
      }
    }

    console.log('App %s added to your org. Now adding resources.', options.proxyName);
    opts.password = options.password; // override a apigeetool side-effect bug
    installJavaCallout(opts, function(err) {
      if (err) {
        if (callback) {
          return callback(err);
        } else {
          return printError(err);
        }
      }

      console.log('App %s deployed.', options.proxyName);
      if (callback) {
        callback(null, options.url ? authUri + '/publicKey' : util.format(authUri + '/publicKey', options.org, options.env));
      } else {
        console.log();
        console.log('Please copy following property to your edgemicro config:');
        console.log('jwt_public_key: ' + authUri + '/publicKey', options.org, options.env);
      }
    });
  });
}


function installJavaCallout(opts, cb) {

  const managementUri =  defaultConfig.edge_config['managementUri'];
  var jarName = 'micro-gateway-products-javacallout-1.0.0.jar';
  // todo: revision?
  var addResourceUri = '%s/v1/organizations/%s/apis/%s/revisions/1/resources?name=%s&type=java';
  var uri = util.format(addResourceUri,  managementUri, opts.organization, opts.api, jarName);

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


// prompt for a password if it is not specified
function promptForPassword(message, options, continuation,cb) {
  if (options.password) {
    continuation(options,cb);
  } else {
    prompt.password(message, function(pw) {
      options.password = pw;
      continuation(options,cb);
    });
  }
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


function translateError(err, res) {
  if (!err && res.statusCode >= 400) {

    var msg = 'cannot ' + res.request.method + ' ' + url.format(res.request.uri) + ' (' + res.statusCode + ')';
    err = new Error(msg);
    err.text = res.body;
    res.error = err;
  }
  return err;
}