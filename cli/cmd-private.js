'use strict';

var app = require('commander');
var privateOperations = require('./lib/private')();
const debug = require('debug')('configure');
const upgradekvm = require('./lib/upgrade-kvm')();
const upgradeauth = require('./lib/upgrade-edgeauth')();
const rotatekey = require('./lib/rotate-key')();

var prompt = require('cli-prompt');

module.exports = function() {
  app
    .command('configure')
    .description('Automated, one-time setup of edgemicro with Apigee Private Cloud')
    .option('-o, --org <org>', 'the organization')
    .option('-r, --runtime-url <runtimeUrl>', 'the URL of the runtime server')
    .option('-m, --mgmt-url <mgmtUrl>', 'the URL of the management server')
    .option('-e, --env <env>', 'the environment')
    .option('-u, --username <user>', 'username of the organization admin')
    .option('-p, --password <password>', 'password of the organization admin')
    .option('-v, --virtual-hosts <virtualHosts>', 'comma separated virtual hosts to deploy with')
    .option('-c, --configDir <configDir>', 'Set the directory where configs are read from.')
    .option('-d, --debug', 'execute with debug output')
    .action((options) => {
      options.error = optionError;
      if (!options.username) { return options.error('username is required'); }
      if (!options.org) { return options.error('org is required'); }
      if (!options.env) { return options.error('env is required'); }
      if (!options.runtimeUrl) { return options.error('runtimeUrl is required'); }
      if (!options.mgmtUrl) { return options.error('mgmtUrl is required'); }
      if (!options.runtimeUrl.includes('http')) {
        return options.error('runtimeUrl requires a prototcol http or https');
      }
      if (!options.mgmtUrl.includes('http')) {
        return options.error('mgmtUrl requires a prototcol http or https');
      }

      promptForPassword(options, (options) => {
        if (!options.password) { return options.error('password is required'); }
        privateOperations.configureEdgemicro(options);
      });
    });

    app
      .command('upgradekvm')
      .option('-o, --org <org>', 'the organization')
      .option('-e, --env <env>', 'the environment')
      .option('-u, --username <user>', 'username of the organization admin')
      .option('-p, --password <password>', 'password of the organization admin')
      .option('-v, --virtualhost <virtualhost>', 'virtual host of the proxy')
      .option('-m, --mgmt-url <mgmtUrl>', 'the URL of the management server')
      .description('upgrade kvm to support JWT Key rotation')
      .action((options)=>{
        options.error = optionError;
        if (!options.username) { return options.error('username is required'); }
        if (!options.org) { return options.error('org is required'); }
        if (!options.env) { return options.error('env is required'); }
        if (!options.runtimeUrl) { return options.error('runtimeUrl is required'); }
        if (!options.mgmtUrl) { return options.error('mgmtUrl is required'); }
        if (!options.mgmtUrl.includes('http')) {
          return options.error('runtimeUrl requires a prototcol http or https');
        }

        promptForPassword(options,(options)=>{
          if (!options.password) { return options.error('password is required'); }
          upgradekvm.upgradekvm(options, () => {
          });      
        });
      });

      app
        .command('upgradeauth')
        .option('-o, --org <org>', 'the organization')
        .option('-e, --env <env>', 'the environment')
        .option('-u, --username <user>', 'username of the organization admin')
        .option('-p, --password <password>', 'password of the organization admin')
        .option('-v, --virtualhost <virtualhost>', 'virtual host of the proxy')
        .option('-m, --mgmt-url <mgmtUrl>', 'the URL of the management server')        
        .description('upgrade edgemicro-auth proxy')
        .action((options)=>{
          options.error = optionError;
          if (!options.username) { return options.error('username is required'); }
          if (!options.org) { return options.error('org is required'); }
          if (!options.env) { return options.error('env is required'); }
          if (!options.mgmtUrl) { return options.error('mgmtUrl is required'); }
          if (!options.mgmtUrl.includes('http')) {
            return options.error('runtimeUrl requires a prototcol http or https')
          }

          promptForPassword(options,(options)=>{
            if (!options.password) { return options.error('password is required'); }
            upgradeauth.upgradeauth(options, () => {
            });      
          })
        });

        app
          .command('rotatekey')
          .option('-o, --org <org>', 'the organization')
          .option('-e, --env <env>', 'the environment')
          .option('-u, --username <user>', 'username of the organization admin')
          .option('-p, --password <password>', 'password of the organization admin')
          .option('-k, --kid <kid>', 'new key identifier')
          .option('-m, --mgmt-url <mgmtUrl>', 'the URL of the management server') 
          .description('Rotate JWT Keys')
          .action((options)=>{
            options.error = optionError;
            if (!options.username) { return options.error('username is required'); }
            if (!options.org) { return options.error('org is required'); }
            if (!options.env) { return options.error('env is required'); }
            if (!options.mgmtUrl) { return options.error('mgmtUrl is required'); }
            if (!options.mgmtUrl.includes('http')) {
              return options.error('runtimeUrl requires a prototcol http or https')
            }
            promptForPassword(options,(options)=>{
              if (!options.password) { return options.error('password is required'); }
              rotatekey.rotatekey(options, () => {
              });      
            })
          });

  app.parse(process.argv);

  var running = false;
  app.commands.forEach(function(command) {
    if (command._name == app.rawArgs[2]) {
      running = true;
    }
  });
  if (!running) {
    app.help();
  }
}
// prompt for a password if it is not specified
function promptForPassword(options, cb) {

  if (options.password) {
    cb(options);
  } else {
    prompt.password("password:", function(pw) {
      options.password = pw;
      cb(options);
    });
  }
}
function optionError(message) {
  console.error(message);
  this.help();
}
