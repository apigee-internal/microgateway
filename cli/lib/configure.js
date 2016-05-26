'use strict';

const edgeconfig = require('microgateway-config')
const prompt = require('cli-prompt');
const path = require('path');
const apigeetool = require('apigeetool');
const _ = require('lodash');
const async = require('async')
const util = require('util')
const fs = require('fs')
const assert = require('assert');

const configLocations = require('../../config/locations');
const defaultConfig = edgeconfig.load({ source: configLocations.getDefaultPath() });
addEnvVars(defaultConfig);

const cert = require('./cert-lib')(defaultConfig)
const deployAuth = require('./deploy-auth')(defaultConfig.edge_config, null)
var authUri = defaultConfig.edge_config.authUri;
const managementUri = defaultConfig.edge_config.managementUri;
const keySecretMessage = defaultConfig.edge_config.keySecretMessage;
var targetFile;

const Configure = function () {
}

module.exports = function () {
  return new Configure();
}

Configure.prototype.configure = function configure(options, cb) {
  assert(options.username, 'username is required');
  assert(options.password, 'password is required');
  assert(options.org, 'org is required');
  assert(options.env, 'env is required');

  options.proxyName = 'edgemicro-auth';
  if (options.url) {
    if (options.url.indexOf('://') === -1) {
      options.url = 'https://' + options.url;
    }
    authUri = options.url + '/edgemicro-auth';
  }

  targetFile = configLocations.getSourceFile(options.org, options.env);
  const cache = configLocations.getCachePath(options.org, options.env);
  if (fs.existsSync(cache)) {
    fs.unlinkSync(cache);
    //console.log('deleted ' + cache);
  }

  const targetPath = configLocations.getSourcePath(options.org, options.env);
  if (fs.existsSync(targetPath)) {
    fs.unlinkSync(targetPath);
    //console.log('deleted ' + targetPath);
  }

  //console.log('init config');
  edgeconfig.init({
    source: configLocations.getDefaultPath(),
    targetDir: configLocations.homeDir,
    targetFile: targetFile,
    overwrite: true
  }, function (err, configPath) {
    deployAuth.checkDeployedProxies(options, (err, options) => {
      if (err) {
        console.error(err);
        cb ? cb(err) : process.exit(1);
        return;
      }
      configureEdgemicroWithCreds(options, (err) => {
        if (err) {
          console.error(err);
          cb ? cb(err) : process.exit(1);
        }
        cb ? cb(err) : process.exit(0)
      });
    })
  });

};


function configureEdgemicroWithCreds(options, cb) {
  var tasks = [],
    agentConfigPath;

  const jwtSearch = _.find(options.deployments, function (proxy) {
    return proxy.name === options.proxyName;
  });

  if (!jwtSearch) {
    tasks.push(function (callback) {
      deployAuth.deployWithLeanPayload(options, callback);
    });
  } else {
    //console.log('App ', options.proxyName, ' is already deployed!');
  }

  tasks.push(
    function (callback) {
      setTimeout(() => {
        //console.log('checking org for existing vault');
        cert.checkCertWithPassword(options, function (err, certs) {
          if (err) {
            cert.installCertWithPassword(options, callback);
          } else {
            //console.log('vault already exists in your org');
            cert.retrievePublicKey(options, callback);
          }
        });
      }, 250)
    }
  );

  tasks.push(
    function (callback) {
      cert.generateKeysWithPassword(options, callback);
    }
  );

  async.series(tasks, function (err, results) {
    if (err) {
      return cb(err);
    }
    assert(targetFile, 'must have an assigned target file')

   // console.log('updating agent configuration');

    if (err) {
      return cb(err)
    }
    agentConfigPath = configLocations.getSourcePath(options.org, options.env);
    const agentConfig = edgeconfig.load({ source: agentConfigPath });

    addEnvVars(agentConfig);

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

    console.log(keySecretMessage);
    const key = results[2] ? results[2].key : results[1].key;
    const secret = results[2] ? results[2].secret : results[1].secret;
    assert(key, 'must have a key');
    assert(secret, 'must have a secret');
    console.log('  key:', key);
    console.log('  secret:', secret);
    console.log();
    process.env.EDGEMICRO_KEY = key;
    process.env.EDGEMICRO_SECRET = secret;

    console.log('edgemicro configuration complete!');
    setTimeout(cb,50)
  });
}

function addEnvVars(config) {
  config.edge_config.managementUri = process.env.MGMT_URI || config.edge_config.managementUri;
  config.edge_config.authUri = process.env.AUTH_URI || config.edge_config.authUri;
  config.edge_config.baseUri = process.env.BASE_URI || config.edge_config.baseUri;
}

function printError(err) {
  if (err.response) {
    console.log(err.response.error);
  } else {
    console.log(err);
  }
}

