'use strict';

const commander = require('commander');
const configure = require('./configure');
const deploy = require('./deploy');
const verify = require('./verify');
const generate = require('./generate');

const setup = function setup() {
  commander
    .command('agent <action>', 'agent commands, see: "edgemicro agent -h"')
    .command('cert <action>', 'certificate commands, see: "edgemicro cert -h"')
    .command('token <action>', 'token commands, see: "edgemicro token -h"')
    .command('private <action>', 'private commands, see: "edgemicro private -h"');

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
    .action(configure);

  commander
    .command('deploy-edge-service')
    .description('deploy edge micro support server to Apigee')
    .option('-n, --proxyName <proxyName>', 'the proxy name')
    .option('-o, --org <org>', 'the organization')
    .option('-e, --env <env>', 'the environment')
    .option('-u, --username <user>', 'username of the organization admin')
    .option('-p, --password <password>', 'password of the organization admin')
    .option('-d, --debug', 'execute with debug output')
    .option('-v, --virtualHosts', 'override virtualHosts (default: "default,secure")')
    .action(deploy);

  commander
    .command('genkeys')
    .option('-o, --org <org>', 'the organization')
    .option('-e, --env <env>', 'the environment')
    .option('-u, --username <user>', 'username of the organization admin')
    .option('-p, --password <password>', 'password of the organization admin')
    .description('generate authentication keys')
    .action(generate);

  commander
    .command('verify')
    .description('verify Edge Micro configuration by testing config endpoints')
    .option('-o, --org <org>', 'the organization')
    .option('-e, --env <env>', 'the environment')
    .option('-k, --key <key>', 'key for authenticating with Edge')
    .option('-s, --secret <secret>', 'secret for authenticating with Edge')
    .action(verify);


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