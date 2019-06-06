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
const BUFFERSIZE    = 10000;
const BATCHSIZE     = 500;
const FLUSHINTERVAL = 5000;
var defaultConfig ;

var certLib = require('./cert-lib')
var cert;
var deployAuthLib = require('./deploy-auth')
var deployAuth;
var authUri, managementUri, keySecretMessage, targetFile;

const Configure = function () {

}

module.exports = function () {
  return new Configure();
}

Configure.prototype.configure = function configure(options, cb) {    
  if (!fs.existsSync(configLocations.getDefaultPath(options.configDir))) {
    console.error("Missing %s, Please run 'edgemicro init'",configLocations.getDefaultPath())
    return cb("Please call edgemicro init first")
  }
    
  defaultConfig = edgeconfig.load({ source: configLocations.getDefaultPath(options.configDir) });
  addEnvVars(defaultConfig);
  deployAuth = deployAuthLib(defaultConfig.edge_config, null)
  managementUri = defaultConfig.edge_config.managementUri;
  keySecretMessage = defaultConfig.edge_config.keySecretMessage;

  if(!options.token) {
    assert(options.username, 'username is required');
    assert(options.password, 'password is required');
  }
  assert(options.org, 'org is required');
  assert(options.env, 'env is required');

  if(!options.proxyName) {
    options.proxyName = 'edgemicro-auth';
  }

  if (options.url) {
    if (options.url.indexOf('://') === -1) {
      options.url = 'https://' + options.url;
    }
    defaultConfig.edge_config.authUri = options.url + '/' + options.proxyName;
  } else {
    var newAuthURI = util.format(defaultConfig.edge_config.authUri, options.org, options.env);
    defaultConfig.edge_config.authUri = newAuthURI;
  }

  authUri = defaultConfig.edge_config.authUri;

  cert = certLib(defaultConfig)

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

  var configFileDirectory = options.configDir || configLocations.homeDir;
  //console.log('init config');
  edgeconfig.init({
    source: configLocations.getDefaultPath(options.configDir),
    targetDir: configFileDirectory,
    targetFile: targetFile,
    overwrite: true
  }, function (err, configPath) {
    options.deployed = false;
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
        cb ? cb(err) : process.exit(0);
      });
    })
  });

};


function configureEdgemicroWithCreds(options, cb) {
  var tasks = [],
    agentConfigPath;
	
  if (options.deployed == false) {
    tasks.push(function (callback) {
      deployAuth.deployWithLeanPayload(options, callback);
    });
  } 

  tasks.push(
    function (callback) {
      setTimeout(() => {
        console.log('checking org for existing KVM');
        cert.checkCertWithPassword(options, function (err, certs) {
          if (err) {
            console.log('error checking for cert. Installing new cert.');
            cert.installCertWithPassword(options, callback);
          } else {
            console.log('KVM already exists in your org');
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
    agentConfigPath = configLocations.getSourcePath(options.org, options.env, options.configDir);
    const agentConfig = edgeconfig.load({ source: agentConfigPath });

    addEnvVars(agentConfig);

    if (options.deployed == false) {  
      agentConfig['edge_config']['jwt_public_key'] = (options.url ? options.url+"/edgemicro-auth/publicKey" : results[0]); // get deploy results
      agentConfig['edge_config'].bootstrap = results[2].bootstrap; // get genkeys results
    } else {
      agentConfig['edge_config']['jwt_public_key'] = authUri + '/publicKey';
      agentConfig['edge_config'].bootstrap = results[1].bootstrap;
    }

    var publicKeyUri = agentConfig['edge_config']['jwt_public_key'];
    if (publicKeyUri) {
      agentConfig['edge_config']['products'] = publicKeyUri.replace('publicKey', 'products');

      if (!agentConfig.hasOwnProperty('oauth') || agentConfig['oauth'] == null) {
        agentConfig['oauth'] = {};
      }
      agentConfig['oauth']['verify_api_key_url'] = publicKeyUri.replace('publicKey', 'verifyApiKey');
    }

    var bootstrapUri = agentConfig['edge_config']['bootstrap'];
    if (bootstrapUri) {
      if (!agentConfig.hasOwnProperty('analytics') || agentConfig['analytics'] == null) {
        agentConfig['analytics'] = {};
      }

      agentConfig['analytics']['uri'] = bootstrapUri.replace('bootstrap', 'axpublisher');
      agentConfig['analytics']['bufferSize']    = BUFFERSIZE;
      agentConfig['analytics']['batchSize']     = BATCHSIZE;
      agentConfig['analytics']['flushInterval'] = FLUSHINTERVAL;
    }

    console.log();
    console.log('saving configuration information to:', agentConfigPath);
    edgeconfig.save(agentConfig, agentConfigPath); // if it didn't throw, save succeeded
    console.log();

    if (options.deployed == true) {  
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
    setTimeout(cb, 50)
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
