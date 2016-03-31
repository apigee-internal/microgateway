'use strict';

const commander = require('commander');
const cert = require('./lib/cert')();

const setup = function setup() {

  commander
    .command('install')
    .option('-o, --org <org>', 'the organization')
    .option('-e, --env <env>', 'the environment')
    .option('-u, --username <user>', 'username of the organization admin')
    .option('-p, --password <password>', 'password of the organization admin')
    .option('-f, --force', 'replace any existing keys')
    .description('install a certificate for your organization')
    .action((options) => {
      options.error = optionError;
      cert.installCert(options)
    });

  commander
    .command('delete')
    .option('-o, --org <org>', 'the organization')
    .option('-e, --env <env>', 'the environment')
    .option('-u, --username <user>', 'username of the organization admin')
    .option('-p, --password <password>', 'password of the organization admin')
    .description('delete the certificate for your organization')
    .action((options) => {
      options.error = optionError;
      cert.deleteCert(options)
    });

  commander
    .command('check')
    .option('-o, --org <org>', 'the organization')
    .option('-e, --env <env>', 'the environment')
    .option('-u, --username <user>', 'username of the organization admin')
    .option('-p, --password <password>', 'password of the organization admin')
    .description('check that your organization has a certificate installed')
    .action((options) => {
      options.error = optionError;
      cert.checkCert(options)
    });

  commander
    .command('public-key')
    .option('-o, --org <org>', 'the organization')
    .option('-e, --env <env>', 'the environment')
    .description('retrieve the public key')
    .action((options) => {
      options.error = optionError;
      cert.retrievePublicKey(options)
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

module.exports = setup;