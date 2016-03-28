'use strict';

const edgeconfig = require('microgateway-config')
const prompt = require('cli-prompt');
const path = require('path');
const apigeetool = require('apigeetool');
const _ = require('lodash');
const async = require('async')
const util = require('util')
const fs = require('fs')

const configLocations = require('../../config/locations');
const defaultConfig = edgeconfig.load({ source: configLocations.getDefaultPath() });
const cert = require('./cert')(defaultConfig)
const deployAuth = require('./deploy-auth')(defaultConfig.edge_config,null)

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
      deployAuth.deployWithLeanPayload(options, callback);
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

