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
const { v4: uuid } = require('uuid');
const debug = require('debug')('microgateway');
const jsdiff = require('diff');
const _ = require('lodash');
//const os = require('os');
const writeConsoleLog = require('microgateway-core').Logging.writeConsoleLog;
const AdminServer = require('microgateway-core').AdminServer;
edgeconfig.setConsoleLogger(writeConsoleLog);
const Gateway = function() {};

const CONSOLE_LOG_TAG_COMP = 'microgateway gateway';

const START_SYNCHRONIZER = 1;
const START_SYNCHRONIZER_AND_EMG = 2;

module.exports = function() {
    return new Gateway();
};


// initializeMicroGatewayLogging
// All logging is initialized here. 
// For logging to happend xalling initializeMicroGatewayLogging is required at some point early on in 
// the flow of configuration
function initializeMicroGatewayLogging(config,options) {
    // gateway from require
    gateway.Logging.init(config,options);
}


Gateway.prototype.start = (options,cb) => {
    //const self = this;
    try {
        fs.accessSync(ipcPath, fs.F_OK);
        writeConsoleLog('error',{component: CONSOLE_LOG_TAG_COMP},'Edgemicro seems to be already running.');
        writeConsoleLog('error',{component: CONSOLE_LOG_TAG_COMP},'If the server is not running, it might because of incorrect shutdown of the prevous start.');
        writeConsoleLog('error',{component: CONSOLE_LOG_TAG_COMP},'Try removing ' + ipcPath + ' and start again');
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
        key: options.key || process.env.EDGEMICRO_KEY,
        secret: options.secret || process.env.EDGEMICRO_SECRET
    };

    var args = {
        target: cache,
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
        env: options.env,
        metrics: options.metrics !== undefined ? options.metrics : false
    }

    const startSynchronizer = (err, config) => {
        if (err) {
            writeConsoleLog('error', { component: CONSOLE_LOG_TAG_COMP }, "Failed in writing to Redis DB.", err);
            return;
        }
        edgeconfig.save(config, cache);
    };

    const startGateway = (err, config) => {
        if (err) {
            const exists = fs.existsSync(cache);
            writeConsoleLog('error', { component: CONSOLE_LOG_TAG_COMP }, "Failed to retieve config from gateway. continuing, will try cached copy..");
            writeConsoleLog('error', { component: CONSOLE_LOG_TAG_COMP }, err);
            if (!exists) {
                writeConsoleLog('error', { component: CONSOLE_LOG_TAG_COMP }, 'Cache configuration ' + cache + ' does not exist. exiting.');
                return;
            }
            else {
                writeConsoleLog('log', { component: CONSOLE_LOG_TAG_COMP }, 'Using cached configuration from %s', cache);
                config = edgeconfig.load({
                    source: cache
                });
                if (options.port) {
                    config.edgemicro.port = parseInt(options.port);
                }
            }
        }
        else {
            if (options.port) {
                config.edgemicro.port = parseInt(options.port);
            }
            edgeconfig.save(config, cache);
        }
        config = edgeconfig.replaceEnvTags(config, { disableLogs: true  });
        config.uid = uuid();
        initializeMicroGatewayLogging(config, options);
        var opt = {};
        //set pluginDir
        if (!args.pluginDir) {
            if (config.edgemicro.plugins && config.edgemicro.plugins.dir) {
                args.pluginDir = path.resolve(config.edgemicro.plugins.dir);
            }
        }

        if(options.key && options.secret){
            args.keys = keys;
        }

        args['metrics'] = options.metrics;
        opt.args = [JSON.stringify(args)];
        opt.timeout = 10;
        opt.logger = gateway.Logging.getLogger();
        //Let reload cluster know how many processes to use if the user doesn't want the default
        if (options.processes) {
            opt.workers = Number(options.processes);
        }

        let adminServer = null;
        if(options.metrics){
            let port = config.edgemicro.port + 1;
            if ( config.metrics && config.metrics.port ) {
                port = config.metrics.port;
            }
            let rolloverAllFlag = false;
           
            if ( config.metrics && config.metrics.rollover_all ) {
                rolloverAllFlag = config.metrics.rollover_all;
            }
            adminServer = new AdminServer(port, config.edgemicro.address, config.edgemicro.ssl, rolloverAllFlag);
            adminServer.setCacheConfig(config);
            adminServer.start();
            opt.adminServer = adminServer;
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
                    writeConsoleLog('log', { component: CONSOLE_LOG_TAG_COMP }, 'Received reload instruction. Proceeding to reload');
                    mgCluster.reload((msg) => {
                        if (typeof msg === 'string') {
                            writeConsoleLog('log', { component: CONSOLE_LOG_TAG_COMP }, msg);
                            socket.sendMessage({ 'reloaded': false, 'message': msg });
                        }
                        else {
                            socket.sendMessage(true);
                            writeConsoleLog('log', { component: CONSOLE_LOG_TAG_COMP }, 'Reload completed');
                        }
                    });
                }
                else if (message.command === 'stop') {
                    writeConsoleLog('log', { component: CONSOLE_LOG_TAG_COMP }, 'Received stop instruction. Proceeding to stop');
                    mgCluster.terminate(() => {
                        writeConsoleLog('log', { component: CONSOLE_LOG_TAG_COMP }, 'Stop completed');
                        socket.sendMessage(true);
                        process.exit(0);
                    });
                }
                else if (message.command === 'status') {
                    socket.sendMessage(mgCluster.countTracked());
                }
            });
        });
        mgCluster.run();
        writeConsoleLog('log', { component: CONSOLE_LOG_TAG_COMP }, 'PROCESS PID : ' + process.pid);
        try {
            fs.appendFileSync(pidPath, process.pid.toString());
        }catch(e){
            debug('error', e);
        }
        process.on('exit', () => {
            if (!isWin) {
                writeConsoleLog('log', { component: CONSOLE_LOG_TAG_COMP }, 'Removing the socket file as part of cleanup');
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
        process.on('uncaughtException', (err) => {
            writeConsoleLog('error', { component: CONSOLE_LOG_TAG_COMP }, err);
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
            writeConsoleLog('log', { component: CONSOLE_LOG_TAG_COMP }, 'Checking for change in configuration');
            if (configurl)
                opts.configurl = configurl;
            //var self = this;
            edgeconfig.get(opts, (err, newConfig) => {
                if (validator(newConfig) === false && !err) {
                    err = {};
                }
                if (err) {
                    // failed to check new config. so try to check again after pollInterval
                    writeConsoleLog('error', { component: CONSOLE_LOG_TAG_COMP }, 'Failed to check for change in Config. Will retry after ' + pollInterval + ' seconds');
                    setTimeout(() => {
                        reloadOnConfigChange(oldConfig, cache, opts);
                    }, pollInterval * 1000);
                }
                else {
                    pollInterval = config.edgemicro.config_change_poll_interval ? config.edgemicro.config_change_poll_interval : pollInterval;
                    const newConfigEnvReplaced = edgeconfig.replaceEnvTags(newConfig, { disableLogs: true  });
                    var isConfigChanged = hasConfigChanged(oldConfig,  newConfigEnvReplaced);
                    if (isConfigChanged) {
                        writeConsoleLog('log', { component: CONSOLE_LOG_TAG_COMP }, 'Configuration change detected. Saving new config and Initiating reload');
                        edgeconfig.save(newConfig, cache);
                        if ( adminServer ) {
                            adminServer.setCacheConfig(newConfigEnvReplaced);
                        }
                        clientSocket.sendMessage({
                            command: 'reload'
                        });
                    }
                    setTimeout(() => {
                        reloadOnConfigChange(newConfigEnvReplaced, cache, opts);
                    }, pollInterval * 1000);
                }
            });
        };
        if (!shouldNotPoll) {
            setTimeout(() => {
                reloadOnConfigChange(config, cache, configOptions);
            }, pollInterval * 1000);
        }
        if (cb && (typeof cb === "function")) {
            writeConsoleLog('log', { component: CONSOLE_LOG_TAG_COMP }, "Calling cb");
            cb();
        }

        if ( process.env.EMG_HEAPDUMP_MODE ) {
            try {
                require('../../tests/heapdump_test').masterHeapDump();
            } catch(e){

            }
        }
        
    };
    configOptions.envTagsReplacerOptions = { disableLogs: true  }
    const sourceConfig = edgeconfig.load(configOptions);
    
    if(sourceConfig.edge_config.synchronizerMode === START_SYNCHRONIZER) { 
        edgeconfig.get(configOptions, startSynchronizer);
        setInterval(()=>{
            edgeconfig.get(configOptions, startSynchronizer)
        },sourceConfig.edgemicro.config_change_poll_interval * 1000);
    }else if(sourceConfig.edge_config.synchronizerMode === START_SYNCHRONIZER_AND_EMG){
        edgeconfig.get(configOptions, startGateway);
    }else{
        // This is for the case 0.
        // There could be a possibility of this being handled differently later, 
        // so we have created a separate case for a later TODO if needed
        edgeconfig.get(configOptions, startGateway);
    }
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
            keys: keys,
            org: options.org,
            env: options.env
        }, (err, config) => {
            if (err) {
                const exists = fs.existsSync(cache);
                writeConsoleLog('error',{component: CONSOLE_LOG_TAG_COMP},"failed to retieve config from gateway. continuing, will try cached copy..");
                writeConsoleLog('error',{component: CONSOLE_LOG_TAG_COMP},err);
                if (!exists) {
                    writeConsoleLog('error',{component: CONSOLE_LOG_TAG_COMP},'cache configuration ' + cache + ' does not exist. exiting.');
                    return;
                } else {
                    writeConsoleLog('log',{component: CONSOLE_LOG_TAG_COMP},'using cached configuration from %s', cache);
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
                if (typeof success === 'object' && success.message) {
                    writeConsoleLog('log',{component: CONSOLE_LOG_TAG_COMP}, success.message);
                }
                else if (success) {
                    writeConsoleLog('log',{component: CONSOLE_LOG_TAG_COMP},'Reload Completed Successfully');
                } else {
                    writeConsoleLog('error',{component: CONSOLE_LOG_TAG_COMP},'Reloading edgemicro was unsuccessful');
                }
                process.exit(0);
            });
        });
    });
    socket.on('error', (error) => {
        if (error) {
            if (error.code === 'ENOENT') {
		        writeConsoleLog('error',{component: CONSOLE_LOG_TAG_COMP},'edgemicro is not running.');
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
                writeConsoleLog('log',{component: CONSOLE_LOG_TAG_COMP},'Stop Completed Succesfully');
            } else {
                writeConsoleLog('error',{component: CONSOLE_LOG_TAG_COMP},'Stopping edgemicro was unsuccessful');
            }
            process.exit(0);
        });
    });
    socket.on('error', (error) => {
        if (error) {
            if (error.code === 'ENOENT') {
		        writeConsoleLog('error',{component: CONSOLE_LOG_TAG_COMP},'edgemicro is not running.');
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
            writeConsoleLog('log',{component: CONSOLE_LOG_TAG_COMP},'edgemicro is running with ' + result + ' workers');
            process.exit(0);
        });
    });
    socket.on('error', (error)=> {
      if (error) {
        if (error.code === 'ENOENT') {
	    writeConsoleLog('error',{component: CONSOLE_LOG_TAG_COMP},'edgemicro is not running.');
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
    //
    if (_.isEqual(oldConfig, newConfig)) {
        debug("no changes detected");
        return false;
    } else {
        if (debug.enabled) {
            var diff = jsdiff.diffWords(JSON.stringify(oldConfig), JSON.stringify(newConfig));
            diff.forEach(function(part) {
                if (part.added)
                    {debug("Added->" + part.value);}
                else if (part.removed)
                    {debug("Removed->" + part.value);}
                else
                    {debug("Unchanged->" + part.value);}
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
