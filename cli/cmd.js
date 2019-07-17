'use strict';

const commander = require('commander');
const url = require('url');
const fs = require('fs');
const os = require('os');
const path = require('path');
const debug = require('debug')('start');
const request = require('request');
const configure = require('./lib/configure')();
const upgradekvm = require('./lib/upgrade-kvm')();
const upgradeauth = require('./lib/upgrade-edgeauth')();
const rotatekey = require('./lib/rotate-key')();
const verify = require('./lib/verify')();
const run = require('./lib/gateway')();
const keyGenerator = require('./lib/key-gen')();
const configLocations = require('../config/locations');
const prompt = require('cli-prompt');
const init = require('./lib/init');
var foreverOptions = require('../forever.json');
const forever = require('forever-monitor');
const pidpath = configLocations.getPIDFilePath();
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
        .option('-t, --token <token>', 'OAuth token to use with management API')
        .option('-r, --url <url>', 'organization\'s custom API URL (https://api.example.com)')
        .option('-d, --debug', 'execute with debug output')
        .option('-c, --configDir <configDir>', 'Set the directory where configs are written.')
        .option('-x, --proxyName <proxyName>', 'Set the custom proxy name for edgemicro-auth')
        .option('-k  --key <key>', 'Path to private key to be used by Apigee Edge')
        .option('-s  --cert <cert>', 'Path to certificate to be used by Apigee Edge')
        .action((options) => {
            options.error = optionError(options);
            options.token = options.token || process.env.EDGEMICRO_SAML_TOKEN;

            if (options.token) {
                //If there is a token lets configure with standard opts.
                if (!options.org) {
                    return options.error('org is required');
                }
                if (!options.env) {
                    return options.error('env is required');
                }
                options.configDir = options.configDir || process.env.EDGEMICRO_CONFIG_DIR;
                configure.configure(options, () => {});

            } else {
                //If there is no token then we can go through the password process
                if (!options.username) {
                    return options.error('username is required');
                }
                if (!options.org) {
                    return options.error('org is required');
                }
                if (!options.env) {
                    return options.error('env is required');
                }
                if (options.key || options.cert) {
                    if (!options.key || !options.cert) {
                        return options.error('key and cert must be passed together');
                    }
                }
                options.configDir = options.configDir || process.env.EDGEMICRO_CONFIG_DIR;
                promptForPassword(options, (options) => {
                    if (!options.password) {
                        return options.error('password is required');
                    }
                    configure.configure(options, () => {});
                })
            }


        });

    commander
        .command('init')
        .description('initialize default.yaml into home dir')
        .option('-c, --configDir <configDir>', 'Set the directory where configs are written.')
        .action((options) => {
            options.configDir = options.configDir || process.env.EDGEMICRO_CONFIG_DIR;
            init(options, (err, location) => {
                console.log("config initialized to %s", location)
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
            options.error = optionError(options);
            if (!options.org) {
                return options.error('org is required');
            }
            if (!options.env) {
                return options.error('env is required');
            }
            if (!options.key) {
                return options.error('key is required');
            }
            if (!options.secret) {
                return options.error('secret is required');
            }
            verify.verify(options);
        });


    commander
        .command('start')
        .option('-o, --org <org>', 'the organization')
        .option('-e, --env <env>', 'the environment')
        .option('-k, --key <key>', 'key for authenticating with Edge')
        .option('-s, --secret <secret>', 'secret for authenticating with Edge')
        .option('-p, --processes <processes>', 'number of processes to start, defaults to # of cores')
        .option('-d, --pluginDir <pluginDir>', 'absolute path to plugin directory')
        .option('-r, --port <portNumber>', 'override port in the config.yaml file')
        .option('-c, --configDir <configDir>', 'Set the directory where configs are read from.')
        .option('-u, --configUrl <configUrl>', 'Provide the endpoint to download the edgemicro config file')
        .option('-a, --apiProxyName <apiProxyName>', 'the api proxy name; must be used with env var EDGEMICRO_LOCAL')
        .option('-v, --revision <revision>', 'api proxy revision; required if apiProxyName is set')
        .option('-b, --basepath <basepath>', 'api proxy basePath; required if apiProxyName is set')
        .option('-t, --target <target>', 'target endpoint for proxy; required if apiProxyName is set')
        .description('start the gateway based on configuration')
        .action((options) => {
            options.error = optionError(options);
            options.secret = options.secret || process.env.EDGEMICRO_SECRET;
            options.key = options.key || process.env.EDGEMICRO_KEY;
            options.org = options.org || process.env.EDGEMICRO_ORG;
            options.env = options.env || process.env.EDGEMICRO_ENV;
            options.processes = options.processes || process.env.EDGEMICRO_PROCESSES;
            options.pluginDir = options.pluginDir || process.env.EDGEMICRO_PLUGIN_DIR;
            options.configDir = options.configDir || process.env.EDGEMICRO_CONFIG_DIR;
            options.configUrl = options.configUrl || process.env.EDGEMICRO_CONFIG_URL;
            options.apiProxyName = options.apiProxyName || process.env.EDGEMICRO_API_PROXYNAME;
            options.revision = options.revision || process.env.EDGEMICRO_API_REVISION;
            options.basepath = options.basepath || process.env.EDGEMICRO_API_BASEPATH;
            options.target = options.target || process.env.EDGEMICRO_API_TARGET;

            debug("EDGEMICRO_LOCAL: " + process.env.EDGEMICRO_LOCAL)
            debug("EDGEMICRO_LOCAL_PROXY: " + process.env.EDGEMICRO_LOCAL_PROXY)

            if (options.port) {
                portastic.test(options.port)
                    .then(function(isAvailable) {
                        if (!isAvailable) {
                            options.error('port is not available.');
                            process.exit(1);
                        }

                    });
            }
            if (!options.key && !process.env.EDGEMICRO_LOCAL) {
                return options.error('key is required');
            }
            if (!options.secret && !process.env.EDGEMICRO_LOCAL) {
                return options.error('secret is required');
            }
            if (!options.org) {
                return options.error('org is required');
            }
            if (!options.env) {
                return options.error('env is required');
            }
            if (options.apiProxyName || options.target || options.revision || options.basepath || process.env.EDGEMICRO_LOCAL || process.env.EDGEMICRO_LOCAL_PROXY) {
                //if any of these are set, look for environment variable
                if (!process.env.EDGEMICRO_LOCAL && !process.env.EDGEMICRO_LOCAL_PROXY) {
                    return options.error('set the EDGEMICRO_LOCAL or EDGEMICRO_LOCAL_PROXY variable for apiProxyName parameter');
                    //process.exit(1);
                } else if (process.env.EDGEMICRO_LOCAL && process.env.EDGEMICRO_LOCAL_PROXY) {
                    return options.error('set the EDGEMICRO_LOCAL or EDGEMICRO_LOCAL_PROXY; not both');
                    //process.exit(1);
                } else {
                    if (options.apiProxyName && options.target && options.revision && options.basepath) {
                        if (!validateUrl(options.target)) {
                            return options.error('target endpoint not a valid url');
                            //process.exit(1);
                        }
                        if (process.env.EDGEMICRO_LOCAL) {
                            //create fake credentials - not used anywhere
                            options.key = 'dummy';
                            options.secret = 'dummy';
                        }
                        //start gateway
                        run.start(options);
                        return;
                    } else {
                        return options.error('apiProxyName, target, revision and basepath are all mandatory parms when EDGEMICRO_LOCAL or EDGEMICRO_LOCAL_PROXY is set');
                        //process.exit(1);
                    }
                }
            }
            if (options.configUrl) {
                options.configDir = options.configDir || os.homedir() + "/" + ".edgemicro";
                if (!fs.existsSync(options.configDir)) fs.mkdirSync(options.configDir);
                var fileName = options.org + "-" + options.env + "-config.yaml";
                debug(fileName);
                var filePath = options.configDir + "/" + fileName;
                debug(filePath);
                var parsedUrl = url.parse(options.configUrl, true);
                debug(options.configUrl);

                if (parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:") {
                    debug("downloading file...");
                    request.get(options.configUrl, function(error, response, body) {
                        if (error) {
                            console.error("config file did not download: " + error);
                            process.exit(1);
                        }
                        try {
                            debug(body);
                            fs.writeFileSync(filePath, body, 'utf8');
                            run.start(options);
                        } catch (err) {
                            console.error("config file could not be written: " + err);
                            process.exit(1);
                        }
                    });
                } else {
                    console.error("url protocol not supported: " + parsedUrl.protocol);
                    process.exit(1);
                }
            } else {
                run.start(options);
            }
        });

    commander
        .command('reload')
        .option('-o, --org <org>', 'the organization')
        .option('-e, --env <env>', 'the environment')
        .option('-k, --key <key>', 'key for authenticating with Edge')
        .option('-s, --secret <secret>', 'secret for authenticating with Edge')
        .option('-c, --configDir <configDir>', 'Set the directory where configs are written.')
        .option('-u, --configUrl <configUrl>', 'Provide the endpoint to download the edgemicro config file')
        .description('reload the edgemicro cluster by pulling new configuration')
        .action((options) => {
            options.error = optionError(options);
            options.secret = options.secret || process.env.EDGEMICRO_SECRET;
            options.key = options.key || process.env.EDGEMICRO_KEY;
            options.org = options.org || process.env.EDGEMICRO_ORG;
            options.env = options.env || process.env.EDGEMICRO_ENV;
            options.configDir = options.configDir || process.env.EDGEMICRO_CONFIG_DIR;
            options.configUrl = options.configUrl || process.env.EDGEMICRO_CONFIG_URL;
            if (!options.key) {
                return options.error('key is required');
            }
            if (!options.secret) {
                return options.error('secret is required');
            }
            if (!options.org) {
                return options.error('org is required');
            }
            if (!options.env) {
                return options.error('env is required');
            }
            if (options.configUrl) {
                options.configDir = options.configDir || os.homedir() + "/" + ".edgemicro";
                if (!fs.existsSync(options.configDir)) fs.mkdirSync(options.configDir);
                var fileName = options.org + "-" + options.env + "-config.yaml";
                debug(fileName);
                var filePath = options.configDir + "/" + fileName;
                debug(filePath);
                var parsedUrl = url.parse(options.configUrl, true);
                debug(options.configUrl);

                if (parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:") {
                    debug("downloading file...");
                    request.get(options.configUrl, function(error, response, body) {
                        if (error) {
                            console.error("config file did not download: " + error);
                            process.exit(1);
                        }
                        try {
                            debug(body);
                            fs.writeFileSync(filePath, body, 'utf8');
                            run.reload(options);
                        } catch (err) {
                            console.error("config file could not be written: " + err);
                            process.exit(1);
                        }
                    });
                }
            } else run.reload(options);
        });

    commander
        .command('stop')
        .description('stop the edgemicro cluster')
        .action((options) => {
            run.stop(options);
        });

    commander
        .command('status')
        .description('Status of the edgemicro cluster')
        .action((options) => {
            run.status(options);
        });

    commander
        .command('forever')
        .option('-f, --file <file>', 'forever-monitor options file')
        .option('-a,--action <action>', 'action can be start or stop; default is start')
        .description('Start microgateway using forever-monitor')
        .action((options) => {
            options.action = options.action || "start";
            options.error = optionError(options);
            if (options.file) {
                foreverOptions = JSON.parse(fs.readFileSync(options.file, {
                    encoding: 'utf8'
                }));
            }
            if (options.action !== "start" && options.action !== "stop") {
                return options.error('action must be start or stop');
            }

            /*  FOUND THIS WITHOUT ASSIGNMENT ?? What should it be doing?
            foreverOptions ? foreverOptions : {
                max: 3,
                silent: false,
                killTree: true,
                minUptime: 2000
            };
            */

            var child = new(forever.Monitor)(path.join(__dirname, '..', 'app.js'), foreverOptions);
            if (options.action === "start") {
                try {
                    fs.appendFileSync(pidpath, process.pid + '|');
                    child.start();
                } catch (piderr) {
                    console.error('failed to start microgateway: ' + piderr);
                    process.exit(1);
                }
            } else {
                try {
                    var pids = fs.readFileSync(pidpath, 'utf8').split('|');
                    if (pids) {
                        pids.forEach(function(pid) {
                            process.kill(parseInt(pid), 'SIGINT');
                        });
                        fs.unlinkSync(pidpath);
                    } else {
                        console.log('pid file not found. please run this command from the folder where microgateway was started.')
                    }
                } catch (piderr) {
                    console.error('failed to stop microgateway: ' + piderr);
                    process.exit(1);
                }
            }
        });

    commander
        .command('genkeys')
        .option('-o, --org <org>', 'the organization')
        .option('-e, --env <env>', 'the environment')
        .option('-u, --username <user>', 'username of the organization admin')
        .option('-p, --password <password>', 'password of the organization admin')
        .description('generate authentication keys for runtime auth between Microgateway and Edge')
        .action((options) => {
            options.error = optionError(options);
            if (!options.username) {
                return options.error('username is required');
            }
            if (!options.org) {
                return options.error('org is required');
            }
            if (!options.env) {
                return options.error('env is required');
            }
            promptForPassword(options, (options) => {
                if (!options.password) {
                    return options.error('password is required');
                }
                keyGenerator.generate(options, (err) => {
                    if ( err ) {
                        process.exit(1)
                    } else {
                        process.exit(0)
                    }
                });
            })

        });

    commander
        .command('revokekeys')
        .option('-o, --org <org>', 'the organization')
        .option('-e, --env <env>', 'the environment')
        .option('-u, --username <user>', 'username of the organization admin')
        .option('-p, --password <password>', 'password of the organization admin')
        .option('-k, --key <key>', 'Microgateway Key to be revoked')
        .option('-s, --secret <secret>', 'Microgateway secret to be revoked')
        .description('revoke authentication keys for runtime auth between Microgateway and Edge')
        .action((options) => {
            options.error = optionError(options);
            if (!options.username) {
                return options.error('username is required');
            }
            if (!options.org) {
                return options.error('org is required');
            }
            if (!options.env) {
                return options.error('env is required');
            }
            if (!options.key) {
                return options.error('key is required');
            }
            if (!options.secret) {
                return options.error('secret is required');
            }
            promptForPassword(options, (options) => {
                if (!options.password) {
                    return options.error('password is required');
                }
                keyGenerator.revoke(options, (err) => {
                    if ( err ) {
                        process.exit(1)
                    } else {
                        process.exit(0)
                    }
                });
            });

        });

    commander
        .command('upgradekvm')
        .option('-o, --org <org>', 'the organization')
        .option('-e, --env <env>', 'the environment')
        .option('-u, --username <user>', 'username of the organization admin')
        .option('-p, --password <password>', 'password of the organization admin')
        .option('-t, --token <token>', 'OAuth token to use with management API')
        .option('-v, --virtualhost <virtualhost>', 'virtual host of the proxy')
        .option('-b, --baseuri <baseuri>', 'baseuri for management apis')
        .description('upgrade kvm to support JWT Key rotation')
        .action((options) => {
            options.error = optionError(options);
            if (!options.org) {
                return options.error('org is required');
            }
            if (!options.env) {
                return options.error('env is required');
            }
            if (options.token) {
                upgradekvm.upgradekvm(options, () => {});
            } else {
                if (!options.username) {
                    return options.error('username is required');
                }
                promptForPassword(options, (options) => {
                    if (!options.password) {
                        return options.error('password is required');
                    }
                    upgradekvm.upgradekvm(options, () => {});
                });
            }
        });

    commander
        .command('upgradeauth')
        .option('-o, --org <org>', 'the organization')
        .option('-e, --env <env>', 'the environment')
        .option('-u, --username <user>', 'username of the organization admin')
        .option('-p, --password <password>', 'password of the organization admin')
        .option('-t, --token <token>', 'OAuth token to use with management API')
        .option('-v, --virtualhost <virtualhost>', 'virtual host of the proxy')
        .option('-b, --baseuri <baseuri>', 'baseuri for management apis')
        .description('upgrade edgemicro-auth proxy')
        .action((options) => {
            options.error = optionError(options);
            options.token = options.token || process.env.EDGEMICRO_SAML_TOKEN;

            if (!options.org) {
                return options.error('org is required');
            }
            if (!options.env) {
                return options.error('env is required');
            }
            if (options.token) {
                upgradeauth.upgradeauth(options, () => {});
            } else {
                if (!options.username) {
                    return options.error('username is required');
                }
                promptForPassword(options, (options) => {
                    if (!options.password) {
                        return options.error('password is required');
                    }
                    upgradeauth.upgradeauth(options, () => {});
                });
            }
        });

    commander
        .command('rotatekey')
        .option('-o, --org <org>', 'the organization')
        .option('-e, --env <env>', 'the environment')
        .option('-u, --username <user>', 'username of the organization admin')
        .option('-p, --password <password>', 'password of the organization admin')
        .option('-k, --kid <kid>', 'new key identifier')
        .option('-P,--prev-kid <oldkid>', 'previous key identifier')
        .option('-b, --baseuri <baseuri>', 'baseuri for management apis')
        .description('Rotate JWT Keys')
        .action((options) => {
            options.error = optionError(options);
            if (!options.username) {
                return options.error('username is required');
            }
            if (!options.org) {
                return options.error('org is required');
            }
            if (!options.env) {
                return options.error('env is required');
            }
            if (!options.kid) {
                return options.error('kid is required');
            }
            promptForPassword(options, (options) => {
                if (!options.password) {
                    return options.error('password is required');
                }
                rotatekey.rotatekey(options, () => {});
            })
        });

    commander
        .command('clean')
        .option('-o, --org <org>', 'the organization')
        .option('-e, --env <env>', 'the environment')
        .option('-u, --username <user>', 'username of the organization admin')
        .option('-p, --password <password>', 'password of the organization admin')
        .description('clean up microgateway artifacts from the org')
        .action((options) => {
            options.error = optionError(options);
            if (!options.username) {
                return options.error('username is required');
            }
            if (!options.org) {
                return options.error('org is required');
            }
            if (!options.env) {
                return options.error('env is required');
            }
            if (!options.kid) {
                return options.error('kid is required');
            }
            promptForPassword(options, (options) => {
                if (!options.password) {
                    return options.error('password is required');
                }
                //TODO
            })
        });

    commander.parse(process.argv);


    var running = false;
    commander.commands.forEach(function(command) {
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

//check url format
function validateUrl(target) {
    try {
        url.parse(target, true);
        return true;
    } catch (err) {
        console.error("Malformed URL: " + err);
        return false;
    }
}

module.exports = setup;
