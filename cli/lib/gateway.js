'use strict';
const path = require('path');
const fs = require('fs');
const net = require('net');
const edgeconfig = require('microgateway-config');
const gateway = require('microgateway-core');
const reloadCluster = require('./reload-cluster');
const JsonSocket = require('../../third_party/json-socket/json-socket');
const configLocations = require('../../config/locations');
const isWin = /^win/.test(process.platform);
const ipcPath = configLocations.getIPCFilePath();
const pidPath = configLocations.getPIDFilePath();
const defaultPollInterval = 600;
const uuid = require('uuid/v1');
const debug = require('debug')('microgateway');
const jsdiff = require('diff');
const _ = require('lodash');

//const os = require('os');

const Gateway = function() {};

module.exports = function() {
    return new Gateway();
};

Gateway.prototype.start = (options,cb) => {
    //const self = this;
    try {
        fs.accessSync(ipcPath, fs.F_OK);
        console.error('Edgemicro seems to be already running.');
        console.error('If the server is not running, it might because of incorrect shutdown of the prevous start.');
        console.error('Try removing ' + ipcPath + ' and start again');
        process.exit(1);
    } catch (e) {
        // Socket does not exist
        // so ignore and proceed
        if (e.code !== "ENOENT") {
            debug(e.message);            
        }
    }

    const source = configLocations.getSourcePath(options.org, options.env, options.configDir);
    const cache = configLocations.getCachePath(options.org, options.env, options.configDir);
    const configurl = options.configUrl;   
    
    const keys = {
        key: options.key,
        secret: options.secret
    };

    var args = {
        target: cache,
        keys: keys,
        pluginDir: options.pluginDir
    };

    const localproxy = {
        apiProxyName: options.apiProxyName,
        revision: options.revision,
        basePath: options.basepath,
        targetEndpoint: options.target
    };

    var configOptions = {
        source: source,
        keys: keys,
        localproxy: localproxy,
        org: options.org,
        env: options.env
    }

    edgeconfig.get(configOptions, (err, config) => {
        if (err) {
            const exists = fs.existsSync(cache);
            console.error("failed to retieve config from gateway. continuing, will try cached copy..");
            console.error(err);
            if (!exists) {
                console.error('cache configuration ' + cache + ' does not exist. exiting.');
                return;
            } else {
                console.log('using cached configuration from %s', cache);
                config = edgeconfig.load({
                    source: cache
                });
                if (options.port) {
                    config.edgemicro.port = parseInt(options.port);
                }
            }
        } else {
            if (options.port) {
                config.edgemicro.port = parseInt(options.port);
            }
            edgeconfig.save(config, cache);
        }

        config.uid = uuid();
        // var logger = gateway.Logging.init(config);
        var opt = {};
        delete args.keys;
        //set pluginDir
        if (!args.pluginDir) {
            if (config.edgemicro.plugins.dir) {
                args.pluginDir = path.resolve(config.edgemicro.plugins.dir);
            }
        }
        opt.args = [JSON.stringify(args)];
        opt.timeout = 10;
        opt.logger = gateway.Logging.getLogger();

        //Let reload cluster know how many processes to use if the user doesn't want the default
        if (options.processes) {
            opt.workers = Number(options.processes);
        }

        var mgCluster = reloadCluster(path.join(__dirname, 'start-agent.js'), opt);

        var server = net.createServer();
        server.listen(ipcPath);

        server.on('connection', (socket) => {
            //enable TCP_NODELAY
            if (config.edgemicro.nodelay === true) {
              debug("tcp nodelay set");
              socket.setNoDelay(true);
            }
            socket = new JsonSocket(socket);
            socket.on('message', (message) => {
                if (message.command === 'reload') {
                    console.log('Recieved reload instruction. Proceeding to reload');
                    mgCluster.reload(() => {
                        console.log('Reload completed');
                        socket.sendMessage(true);
                    });
                } else if (message.command === 'stop') {
                    console.log('Recieved stop instruction. Proceeding to stop');
                    mgCluster.terminate(() => {
                        console.log('Stop completed');
                        socket.sendMessage(true);
                        process.exit(0);
                    });
                } else if (message.command === 'status') {
                    var activeWorkers = mgCluster.activeWorkers();
                    socket.sendMessage(activeWorkers ? activeWorkers.length : 0);
                }
            });
        });

        mgCluster.run();
        console.log('PROCESS PID : ' + process.pid);
        fs.appendFileSync(pidPath, process.pid);

        process.on('exit', () => {
            if (!isWin) {
                console.log('Removing the socket file as part of cleanup');
                fs.unlinkSync(ipcPath);
            }
			fs.unlinkSync(pidPath);
        });

        process.on('SIGTERM', () => {
            process.exit(0);
        });

        process.on('SIGINT', () => {
            process.exit(0);
        });

        process.on('uncaughtException',(err) => {
            console.error(err);
            debug('Caught Unhandled Exception:');
            debug(err);
            process.exit(0);
        });

        var shouldNotPoll = config.edgemicro.disable_config_poll_interval || false;
        var pollInterval = config.edgemicro.config_change_poll_interval || defaultPollInterval;
        // Client Socket for auto reload
        // send reload message to socket.
        var clientSocket = new JsonSocket(new net.Socket()); //Decorate a standard net.Socket with JsonSocket
        clientSocket.connect(ipcPath);

        //start the polling mechanism to look for config changes
        var reloadOnConfigChange = (oldConfig, cache, opts) => {
            console.log('Checking for change in configuration');
            if (configurl) opts.configurl = configurl;
            //var self = this;
            edgeconfig.get(opts, (err, newConfig) => {
                if(validator(newConfig) === false && !err) {
                    err = {};
                }
                if (err) {
                    // failed to check new config. so try to check again after pollInterval
                    console.error('Failed to check for change in Config. Will retry after ' + pollInterval + ' seconds');
                    setTimeout(() => {
                        reloadOnConfigChange(oldConfig, cache, opts);
                    }, pollInterval * 1000);
                } else {
                    pollInterval = config.edgemicro.config_change_poll_interval ? config.edgemicro.config_change_poll_interval : pollInterval;
                    var isConfigChanged = hasConfigChanged(oldConfig, newConfig);
                    if (isConfigChanged) {
                        console.log('Configuration change detected. Saving new config and Initiating reload');
                        edgeconfig.save(newConfig, cache);
                        clientSocket.sendMessage({
                            command: 'reload'
                        });
                    }
                    setTimeout(() => {
                        reloadOnConfigChange(newConfig, cache, opts);
                    }, pollInterval * 1000);
                }
            });
        };

        if (!shouldNotPoll) {
            setTimeout(() => {
                reloadOnConfigChange(config, cache, configOptions);
            }, pollInterval * 1000);
        }
        
        if ( cb && (typeof cb === "function") ) {
            console.log("Calling cb")
            cb();
        }
        
    });
};

Gateway.prototype.reload = (options) => {

    const source = configLocations.getSourcePath(options.org, options.env, options.configDir);
    const cache = configLocations.getCachePath(options.org, options.env, options.configDir);
    const keys = {
        key: options.key,
        secret: options.secret
    };

    var socket = new JsonSocket(new net.Socket()); //Decorate a standard net.Socket with JsonSocket
    socket.on('connect', () => {
        edgeconfig.get({
            source: source,
            keys: keys
        }, (err, config) => {
            if (err) {
                const exists = fs.existsSync(cache);
                console.error("failed to retieve config from gateway. continuing, will try cached copy..");
                console.error(err);
                if (!exists) {
                    console.error('cache configuration ' + cache + ' does not exist. exiting.');
                    return;
                } else {
                    console.log('using cached configuration from %s', cache);
                    config = edgeconfig.load({
                        source: cache
                    })
                }
            } else {
                edgeconfig.save(config, cache);
            }

            socket.sendMessage({
                command: 'reload'
            });
            socket.on('message', (success) => {
                if (success) {
                    console.log('Reload Completed Successfully');
                } else {
                    console.error('Reloading edgemicro was unsuccessful');
                }
                process.exit(0);
            });
        });
    });
    socket.on('error', (error) => {
        if (error) {
            if (error.code === 'ENOENT') {
                console.error('edgemicro is not running.');
            }
        }
    });
    socket.connect(ipcPath);
};


Gateway.prototype.stop = ( /*options */ ) => {
    var socket = new JsonSocket(new net.Socket()); //Decorate a standard net.Socket with JsonSocket
    socket.on('connect', () => {
        socket.sendMessage({
            command: 'stop'
        });
        socket.on('message', (success) => {
            if (success) {
                console.log('Stop Completed Succesfully');
            } else {
                console.error('Stopping edgemicro was unsuccessful');
            }
            process.exit(0);
        });
    });
    socket.on('error', (error) => {
        if (error) {
            if (error.code === 'ENOENT') {
                console.error('edgemicro is not running.');
            }
        }
    });
    socket.connect(ipcPath);
};

Gateway.prototype.status = ( /* options */ ) => {
    var socket = new JsonSocket(new net.Socket()); //Decorate a standard net.Socket with JsonSocket
    socket.on('connect', () => {
        socket.sendMessage({
            command: 'status'
        });
        socket.on('message', (result) => {
            console.log('edgemicro is running with ' + result + ' workers');
            process.exit(0);
        });
    });
    socket.on('error', (error)=> {
      if (error) {
        if (error.code === 'ENOENT') {
          console.error('edgemicro is not running.');
          process.exit(1);
        }
      }
    });
    socket.connect(ipcPath);
};

function hasConfigChanged(oldConfig, newConfig) {
    // This may not be the best way to do the check. But it works for now.
    //return JSON.stringify(oldConfig) != JSON.stringify(newConfig);

    //do not compare uid
    delete oldConfig['uid'];

    
    if (_.isEqual(oldConfig, newConfig)) {
        debug("no changes detected");
        return false;
    } else {
        if (debug.enabled) {
            var diff = jsdiff.diffWords(JSON.stringify(oldConfig), JSON.stringify(newConfig));
            diff.forEach(function(part) {
                if (part.added)
                    debug("Added->" + part.value);
                else if (part.removed)
                    debug("Removed->" + part.value);
                else
                    debug("Unchanged->" + part.value);
            });
        }
        return true;
    }
}

function validator(newConfig) {
    
    //checkObject(newConfig.product_to_proxy) && 
    //checkObject(newConfig.product_to_api_resource)

    if (checkObject(newConfig) &&
        checkObject(newConfig.analytics) && 
        checkObject(newConfig.analytics.source) && 
        checkObject(newConfig.analytics.proxy) && 
        checkObject(newConfig.analytics.key) && 
        checkObject(newConfig.analytics.secret) &&
        checkObject(newConfig.analytics.uri) &&
        checkObject(newConfig.edgemicro) && 
        checkObject(newConfig.edgemicro.port) && 
        checkObject(newConfig.edgemicro.max_connections) &&
        checkObject(newConfig.headers) && 
        Array.isArray(newConfig.proxies)) { 
        debug("configuration incomplete or invalid, skipping configuration");
        return false;
    }

    return true;
}

function checkObject (o) {
    return (typeof o === 'object' && o instanceof Object && !(o instanceof Array));
}
