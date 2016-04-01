'use strict';

var app = require('commander');
var privateOperations = require('./lib/private')();
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
    .action((options) => {
      promptForPassword(options, (options) => {

        options.error = optionError;
        privateOperations.configureEdgemicro(options)
      });
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
function optionError(message) {
  console.error(message);
  this.help();
}
