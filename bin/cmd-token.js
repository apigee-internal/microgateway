'use strict';

const commander = require('commander');  
const token = require('./lib/token')();

const setup = function setup() {

  commander
    .command('decode')
    .option('-k, --key <key>', 'key for authenticating with Edge')
    .option('-s, --secret <secret>', 'secret for authenticating with Edge')
    .option('-f, --file <file>', 'file containing jwt')
    .description('decode a token without verifying it')
    .action((options)=>{
      token.decodeToken(options)
    });

  commander
    .command('verify')
    .option('-f, --file <file>', 'file containing jwt')
    .option('-o, --org <org>', 'the organization')
    .option('-e, --env <env>', 'the environment')
    .description('verify a jwt token against the public key')
    .action((options)=> {
      token.verifyToken(options)
    });

  commander
    .command('get')
    .option('-o, --org <org>', 'the organization')
    .option('-e, --env <env>', 'the environment')
    .option('-i, --id <id>', 'the client id')
    .option('-s, --secret <secret>', 'the client secret')
    .description('create a client_credentials oauth token')
    .action((options)=>{
      token.getToken(options)
    });

  commander.parse(process.argv);


  var running = false;
  commander.commands.forEach(function (command) {
    if (command._name == commander.rawArgs[2]) {
      running = true;
    }
  });
  if (!running) {
    commander.help();
  }
};

module.exports = setup;