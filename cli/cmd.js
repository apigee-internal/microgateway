'use strict';

const commander = require('commander');
const configure = require('./lib/configure')();
const verify = require('./lib/verify')();
const run = require('./lib/gateway')();
const keyGenerator = require('./lib/key-gen')();
const prompt = require('cli-prompt');

const setup = function setup() {
  commander
    .command('token [action]', 'JWT token commands, see: "edgemicro token -h"')
    .command('cert [action]', 'ssh cert commands to store on Apigee Vault, see: "edgemicro cert -h"')
    .command('private [action]', 'Automated, one-time configuration with Edge On-Premises, see: "edgemicro private -h"')


  commander
    .command('configure')
    .description('Automated, one-time configuration with Edge Cloud')
    .option('-o, --org <org>', 'the organization')
    .option('-e, --env <env>', 'the environment')
    .option('-v, --virtualHosts <virtualHosts>', 'override virtualHosts (default: "default,secure")')
    .option('-u, --username <user>', 'username of the organization admin')
    .option('-p, --password <password>', 'password of the organization admin')
    .option('-r, --url <url>', 'organization\'s custom API URL (https://api.example.com)')
    .option('-d, --debug', 'execute with debug output')
    .action((options) => {
      promptForPassword(options,(options)=>{
        options.error = optionError;
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
    .description('start the gateway based on configuration')
    .action((options)=>{
      options.error = optionError;
      run.start(options,(err)=>{
      });
    });


commander
  .command('genkeys')
  .option('-o, --org <org>', 'the organization')
  .option('-e, --env <env>', 'the environment')
  .option('-u, --username <user>', 'username of the organization admin')
  .option('-p, --password <password>', 'password of the organization admin')
  .description('generate authentication keys for runtime auth between Microgateway and Edge')
  .action((options)=>{
    options.error = optionError;
    promptForPassword(options,(options)=>{
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