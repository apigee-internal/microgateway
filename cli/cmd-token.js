'use strict';

const commander = require('commander');
const token = require('./lib/token')();

const setup = function setup() {

  commander
    .command('decode')
    .option('-f, --file <file>', 'file containing jwt')
    .description('decode a token without verifying it')
    .action((options)=>{
      options.error = optionError(options);
      if (!options.file) {return  options.error( 'file is required' );}
      token.decodeToken(options)
    });

  commander
    .command('verify')
    .option('-f, --file <file>', 'file containing jwt')
    .option('-o, --org <org>', 'the organization')
    .option('-e, --env <env>', 'the environment')
    .description('verify a jwt token against the public key')
    .action((options)=> {
      options.error = optionError(options);
      if (!options.file) { return  options.error('file is required'); }
      if (!options.org) { return  options.error('org is required'); }
      if (!options.env) { return  options.error('env is required'); }
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
      options.error = optionError(options);
      if (!options.org) { return  options.error('id is required'); }
      if (!options.secret) { return  options.error('client secret is required'); }
      if (!options.org) { return  options.error('org is required'); }
      if (!options.env) { return  options.error('env is required'); }
      token.getToken(options)
    });

  commander.parse(process.argv);


  var running = false;
  commander.commands.forEach(function (command) {
    if (command._name === commander.rawArgs[2]) {
      running = true;
    }
  });
  if (!running) {
    commander.help();
  }
};

function optionError(caller) {
  return(((obj) => { 
    return((message) => {
      console.error(message);
      obj.help();  
    });
   })(caller))
}


module.exports = setup;