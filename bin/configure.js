'use strict';

const edgeconfig = require('microgateway-config')
const prompt = require('cli-prompt');
const path = require('path');
const os = require('os');
const apigeetool = require('apigeetool');
const _ = require('lodash');
const async = require('async')
const util = require('util')

const defaultConfigPath = path.join(__dirname, '..', 'config', 'default.yaml');
const targetFile = 'config.yaml';
const alternateFile = 'new-config.yaml';
const targetDir = path.join(__dirname, '..', 'config');
const defaultConfig = edgeconfig.load({source:defaultConfigPath});
const cert = require('./cert')(defaultConfig)


module.exports = function configure(options) {
  configureEdgemicro(options,defaultConfig);
};

const configureEdgemicro = function configureEdgemicro(options) {
  if (!options.username) { return optionError.bind(this)('username is required'); }
  if (!options.org) { return optionError.bind(this)('org is required'); }
  if (!options.env) { return optionError.bind(this)('env is required'); }

  promptForPassword('org admin password: ', options, checkDeployedProxies);
}

function checkDeployedProxies(options) {

  console.log();
  console.log('checking for previously deployed proxies')
  const opts = {
    organization: options.org,
    environments: options.env,
    environment: options.env,
    baseuri: defaultConfig['managementUri'],
    username: options.username,
    password: options.password,
    debug: options.debug,
    overwrite: options.overwrite
  }

  apigeetool.listDeployments(opts, function(err, proxies) {
    if (err) { return printError(err); }

    _.assign(options, proxies);
    configureEdgemicroWithCreds(options);
  })
}

function configureEdgemicroWithCreds(options) {
  var tasks = [],authUri,agentConfigPath;

  options.proxyName = 'edgemicro-auth';

  if (options.url) {
    if (options.url.indexOf('://') === -1) {
      options.url = 'https://' + options.url;
    }
     authUri = options.url + '/edgemicro-auth';
  }else{
    authUri = defaultConfig.authUri
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
      cert.checkCertWithPassword(options, function(err, certs){
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


    const answercb = function (overwrite) {
      edgeconfig.init({
        source: defaultConfigPath,
        targetDir: targetDir,
        targetFile: overwrite ? targetFile : alternateFile,
        overwrite:overwrite
      }, function (err, configPath) {
        if(err){
          process.exit(1)
        }
        agentConfigPath = configPath;
        const agentConfig = edgeconfig.load({source:configPath});

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

        console.info(defaultConfig.keySecretMessage);
        console.info('  key:', results[2] ? results[2].key : results[1].key);
        console.info('  secret:', results[2] ? results[2].secret : results[1].secret);
        console.log();

        console.log('edgemicro configuration complete!');
        process.exit(0)
      });
    };
    const promptCb = function (prompt_message, answer_cb) {
      console.log();
      prompt(prompt_message, answer_cb);
    }
    if(options.overwrite){
      answercb(options.overwrite.match(/^(yes|ok|true|y)$/i) ? true : false)
    }else {
      promptCb('overwrite exisiting configuration? (y/n) ', function (ans) {
        ans = ans.match(/^(yes|ok|true|y)$/i) ? true : false;
        answercb(ans)
      });
    }
  });
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