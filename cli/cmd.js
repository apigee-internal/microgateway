'use strict';

const commander = require('commander');
const configure = require('./lib/configure')();
const verify = require('./lib/verify')();
const run = require('./lib/gateway')();
const keyGenerator = require('./lib/key-gen')();
const prompt = require('cli-prompt');

const setup = function setup() {
  commander
    .command('token [action]', 'token commands, see: "edgemicro token -h"')
    .command('cert [action]', 'cert commands, see: "edgemicro cert -h"')
    .command('private [action]', 'private commands, see: "edgemicro private -h"')


  commander
    .command('configure')
    .description('automated, one-time setup for a new edgemicro instance')
    .option('-o, --org <org>', 'the organization')
    .option('-e, --env <env>', 'the environment')
    .option('-v, --virtualHosts <virtualHosts>', 'override virtualHosts (default: "default,secure")')
    .option('-u, --username <user>', 'username of the organization admin')
    .option('-p, --password <password>', 'password of the organization admin')
    .option('-r, --url <url>', 'organization\'s custom API URL (https://api.example.com)')
    .option('-d, --debug', 'execute with debug output')
    .action((options) => {
      options.error = optionError;
      if (!options.username) { return options.error('username is required'); }
      if (!options.org) { return options.error('org is required'); }
      if (!options.env) { return options.error('env is required'); }
      promptForPassword(options,(options)=>{
        if (!options.password) { return options.error('password is required'); }
        configure.configure(options, () => {
          process.exit(0);
        });
      })
    });


  commander
    .command('verify')
    .description('verify Edge Micro configuration by testing config endpoints')
    .option('-o, --org <org>', 'the organization')
    .option('-e, --env <env>', 'the environment')
    .option('-k, --key <key>', 'key for authenticating with Edge')
    .option('-s, --secret <secret>', 'secret for authenticating with Edge')
    .action((options) => {
      options.error = optionError;
      if (!options.org) { return  options.error('org is required'); }
      if (!options.env) { return  options.error('env is required'); }
      if (!options.key) { return  options.error('key is required'); }
      if (!options.secret) { return  options.error('secret is required'); }
      verify.verify(options);
    });


  commander
    .command('start')
    .option('-o, --org <org>', 'the organization')
    .option('-e, --env <env>', 'the environment')
    .option('-k, --key <key>', 'key for authenticating with Edge')
    .option('-s, --secret <secret>', 'secret for authenticating with Edge')
    .option('-i, --ignorecachedconfig', 'bypass cached config')
    .option('-f, --forever', 'will ensure the server will restart in case of exceptions')
    .description('control agent processes')
    .action((options)=>{
      options.error = optionError;
      const defaultKey = process.env.EDGEMICRO_KEY
      const defaultSecret = process.env.EDGEMICRO_SECRET
      if (!options.key && !defaultKey) {return  options.error('key is required');}
      if (!options.secret && !defaultSecret) {return  options.error('secret is required');}
      if (!options.org) { return  options.error('org is required'); }
      if (!options.env) { return  options.error('env is required'); }
      if (defaultKey) {
        options.key = options.key || defaultKey;
      }
      if (defaultSecret) {
        options.secret = options.secret || defaultSecret;
      }
      run.start(options,(err)=>{
        console.log("command started successfully.")
      });
    });


commander
  .command('genkeys')
  .option('-o, --org <org>', 'the organization')
  .option('-e, --env <env>', 'the environment')
  .option('-u, --username <user>', 'username of the organization admin')
  .option('-p, --password <password>', 'password of the organization admin')
  .description('generate authentication keys')
  .action((options)=>{
    options.error = optionError;
    if (!options.username) { return options.error('username is required'); }
    if (!options.org) { return options.error('org is required'); }
    if (!options.env) { return options.error('env is required'); }
    promptForPassword(options,(options)=>{
      if (!options.password) { return options.error('password is required'); }
      keyGenerator.generate(options,(err)=>{
        err ? process.exit(1) : process.exit(0);
      });
    })

  });

  commander.parse(process.argv);


  var running = false;
  commander.commands.forEach(function(command) {
    if (command._name == commander.rawArgs[2]) {
      running = true;
    }
  });
  if (!running) {
    commander.help();
  }
};

function optionError(message) {
  console.error(message);
  this.help();
}

// prompt for a password if it is not specified
function promptForPassword( options, cb) {

  if (options.password) {
    cb(options);
  } else {
    prompt.password("password:", function(pw) {
      options.password = pw;
      cb(options);
    });
  }
}


module.exports = setup;