'use strict';

const commander = require('commander');
const configure = require('./lib/configure')();
const verify = require('./lib/verify')();
const run = require('./lib/gateway')();
const keyGenerator = require('./lib/key-gen')();
const prompt = require('cli-prompt');
const init = require('./lib/init');
var portastic = require('portastic');

const setup = function setup() {
  commander
    .version(require('../package.json').version);
  commander
    .command('token [action]', 'JWT token commands, see: "edgemicro token -h"')
    .command('cert [action]', 'ssh cert commands to store on Apigee Vault, see: "edgemicro cert -h"')
    .command('private [action]', 'Automated, one-time configuration with Edge On-Premises, see: "edgemicro private -h"');


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
      options.error = optionError;
      if (!options.username) { return options.error('username is required'); }
      if (!options.org) { return options.error('org is required'); }
      if (!options.env) { return options.error('env is required'); }

      promptForPassword(options,(options)=>{
        if (!options.password) { return options.error('password is required'); }
        configure.configure(options, () => {
        });
      })
    });

 commander
    .command('init')
    .description('initialize default.yaml into home dir')
    .action((options) => {
      init((err,location)=>{
        console.log("config initialized to %s",location)
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
    .option('-p, --processes <processes>', 'number of processes to start, defaults to # of cores')
    .option('-d, --pluginDir <pluginDir>','absolute path to plugin directory')
    .option('-r, --port <portNumber>','override port in the config.yaml file')
    .description('start the gateway based on configuration')
    .action((options)=>{
      options.error = optionError;
      options.secret = options.secret || process.env.EDGEMICRO_SECRET ;
      options.key =  options.key || process.env.EDGEMICRO_KEY;
      options.org = options.org || process.env.EDGEMICRO_ORG;
      options.env = options.env || process.env.EDGEMICRO_ENV;
      options.processes =  options.processes || process.env.EDGEMICRO_PROCESSES;

      if (options.port) {
        portastic.test(options.port)
          .then(function(isAvailable){
            if(!isAvailable) {
              options.error('port is not available.');
              process.exit(1);
            }
          });
      }
      if (!options.key ) {return  options.error('key is required');}
      if (!options.secret ) {return  options.error('secret is required');}
      if (!options.org ) { return  options.error('org is required'); }
      if (!options.env ) { return  options.error('env is required'); }

      // TODO once apid API is changed to no longer need env, this can go away
      process.env.ENV = options.env;
      run.start(options);
    });

  commander
    .command('reload')
    .option('-o, --org <org>', 'the organization')
    .option('-e, --env <env>', 'the environment')
    .option('-k, --key <key>', 'key for authenticating with Edge')
    .option('-s, --secret <secret>', 'secret for authenticating with Edge')
    .description('reload the edgemicro cluster by pulling new configuration')
    .action((options)=> {
      options.error = optionError;
      options.secret = options.secret || process.env.EDGEMICRO_SECRET;
      options.key = options.key || process.env.EDGEMICRO_KEY;
      options.org = options.org || process.env.EDGEMICRO_ORG;
      options.env = options.env || process.env.EDGEMICRO_ENV;
      if (!options.key ) {return  options.error('key is required');}
      if (!options.secret ) {return  options.error('secret is required');}
      if (!options.org ) { return  options.error('org is required'); }
      if (!options.env ) { return  options.error('env is required'); }
      run.reload(options);
    });

  commander
    .command('stop')
    .description('stop the edgemicro cluster')
    .action((options)=> {
      run.stop(options);
    });

  commander
    .command('status')
    .description('Status of the edgemicro cluster')
    .action((options)=> {
      run.status(options);
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
