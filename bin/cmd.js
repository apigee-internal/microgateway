'use strict';

const commander = require('commander');
const configure = require('./lib/configure');
const verify = require('./lib/verify');
const run = require('./lib/gateway');
const cert = require('./lib/cert-cmd');
const token = require('./lib/token')

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
    .option('-w, --overwrite <overwrite>', 'overwrite the current config, yes|ok|true|y')
    .option('-d, --debug', 'execute with debug output')
    .action(configure);


  commander
    .command('verify')
    .description('verify Edge Micro configuration by testing config endpoints')
    .option('-o, --org <org>', 'the organization')
    .option('-e, --env <env>', 'the environment')
    .option('-k, --key <key>', 'key for authenticating with Edge')
    .option('-s, --secret <secret>', 'secret for authenticating with Edge')
    .action(verify);


  commander
    .command('start')
    .option('-k, --key <key>', 'key for authenticating with Edge')
    .option('-s, --secret <secret>', 'secret for authenticating with Edge')
    .option('-d, --defaultConfig <sourcePath>', 'default config directory')
    .option('-t, --targetConfig <targetPath>', 'target config directory')
    .option('-f, --forever', 'agent port (default 9000)')
    .description('control agent processes')
    .action(run.start);

  commander
    .command('cert-install')
    .option('-o, --org <org>', 'the organization')
    .option('-e, --env <env>', 'the environment')
    .option('-u, --username <user>', 'username of the organization admin')
    .option('-p, --password <password>', 'password of the organization admin')
    .option('-f, --force', 'replace any existing keys')
    .description('install a certificate for your organization')
    .action(cert.installCert);

  commander
    .command('cert-delete')
    .option('-o, --org <org>', 'the organization')
    .option('-e, --env <env>', 'the environment')
    .option('-u, --username <user>', 'username of the organization admin')
    .option('-p, --password <password>', 'password of the organization admin')
    .description('delete the certificate for your organization')
    .action(cert.deleteCert);

  commander
    .command('cert-check')
    .option('-o, --org <org>', 'the organization')
    .option('-e, --env <env>', 'the environment')
    .option('-u, --username <user>', 'username of the organization admin')
    .option('-p, --password <password>', 'password of the organization admin')
    .description('check that your organization has a certificate installed')
    .action(cert.checkCert);

  commander
    .command('cert-public-key')
    .option('-o, --org <org>', 'the organization')
    .option('-e, --env <env>', 'the environment')
    .description('retrieve the public key')
    .action(cert.retrievePublicKey);


  commander
    .command('token-decode')
    .option('-k, --key <key>', 'key for authenticating with Edge')
    .option('-s, --secret <secret>', 'secret for authenticating with Edge')
    .option('-f, --file <file>', 'file containing jwt')
    .description('decode a token without verifying it')
    .action((options)=>{
      token.decodeToken(options)
    });

  commander
    .command('token-verify')
    .option('-k, --key <key>', 'key for authenticating with Edge')
    .option('-s, --secret <secret>', 'secret for authenticating with Edge')
    .option('-f, --file <file>', 'file containing jwt')
    .option('-o, --org <org>', 'the organization')
    .option('-e, --env <env>', 'the environment')
    .description('verify a jwt token against the public key')
    .action((options)=> {
      token.verifyToken(options)
    });

  commander
    .command('token-get')
    .option('-k, --key <key>', 'key for authenticating with Edge')
    .option('-s, --secret <secret>', 'secret for authenticating with Edge')
    .option('-o, --org <org>', 'the organization')
    .option('-e, --env <env>', 'the environment')
    .option('-i, --id <id>', 'the client id')
    .option('-t, --token <secret>', 'the client secret')
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