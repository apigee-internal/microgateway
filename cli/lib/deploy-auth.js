'use strict';
const tmp = require('tmp');
const cpr = require('cpr');
const apigeeUtils = require('volos-util-apigee');
const assert = require('assert');
const path = require('path');
const async = require('async')
const util = require('util')
const rimraf = util.callbackify(require('rimraf').rimraf);
const fs = require('fs')
const xml2js = require("xml2js");
const parseString = xml2js.parseString;

const DEFAULT_HOSTS = 'default,secure';
const debug = require('debug')('edgemicro-auth')
var exec = require('child_process').exec;
const writeConsoleLog = require('../../core').Logging.writeConsoleLog;

const CONSOLE_LOG_TAG_COMP = 'microgateway deploy auth';

var run = function(cmd, cb) {
    exec(cmd, {
        maxBuffer: 1024 * 500
    }, function(error /*, stdout, stderr */) {
        cb(error)
    });
};


const Deployment = function(edge_config, virtualHosts) {
    this.managementUri = edge_config.managementUri;
    this.authUri = edge_config.authUri;
    this.virtualHosts = virtualHosts;
    assert(this.authUri);
    assert(this.managementUri);
}
module.exports = function(edge_config, virtualHosts) {
    return new Deployment(edge_config, virtualHosts);
}
// deploys internal apiproxy to specified managementUrl
Deployment.prototype.deployEdgeMicroInternalProxy = function deployEdgeMicroInternalProxy(options, callback) {
    var opts = {
        organization: options.org,
        environments: options.env,
        baseuri: this.managementUri,
        debug: options.debug,
        verbose: options.debug,
        api: 'edgemicro-internal',
        directory: path.join(__dirname, '..', '..', 'edge'),
        'import-only': false,
        'resolve-modules': false,
        virtualhosts: this.virtualHosts || 'default'
    };

    if (options.token) {
        opts.token = options.token;
    } else {
        opts.username = options.username;
        opts.password = options.password;
    }    

    apigeeUtils.deployProxy(opts, function(err, res) {
        if (err) {
            return callback(err);
        }

        callback(null, res);
    });
}

Deployment.prototype.deployWithLeanPayload = function deployWithLeanPayload(options, callback) {
    const authUri = this.authUri;
    const managementUri = this.managementUri;
    const homeDir = process.env[(process.platform === 'win32') ? 'USERPROFILE' : 'HOME'];
    var tmpDir = tmp.dirSync({
        keep: true,
        tmpdir: path.resolve(homeDir, '.edgemicro')
    });
    var tasks = [];
    var publicKeyUri;
    var self = this;

    // copy bin folder into tmp
    tasks.push(function(cb) {
        //writeConsoleLog('log',{component: CONSOLE_LOG_TAG_COMP},'copy auth app into tmp dir');
        cpr(path.resolve(__dirname, '..', '..', 'node_modules', 'microgateway-edgeauth'), tmpDir.name, cb);
    });


    // copy bin folder into tmp
    tasks.push(function(cb) {
        //writeConsoleLog('log',{component: CONSOLE_LOG_TAG_COMP},'copy config into tmp dir');
        cpr(path.resolve(__dirname, '..', '..', 'config'), tmpDir.name + '/config', cb);
    });

    tasks.push(function(cb) {
        rimraf(tmpDir.name + "/node_modules/", cb);
    })
    tasks.push(function(cb) {
        run('cd ' + tmpDir.name + ' && npm install && cd ' + process.cwd(), cb);
    })
    tasks.push(function(cb) {
        rimraf(tmpDir.name + "/node_modules/express", cb);
    })
    // deploy lean payload
    tasks.push(function(cb) {
        const dir = tmpDir.name;
        self.deployProxyWithPassword(managementUri, authUri, options, dir, (err, uri) => {
            publicKeyUri = uri;
            cb(err, uri)
        });
    });

    //delete tmp dir
    tasks.push(function(cb) {
        rimraf(tmpDir.name, cb);
    })

    async.series(tasks, function(err /*, results */) {
        if (err) {
            return callback(err);
        }

        // pass JWT public key URL through callback
        callback(null, publicKeyUri);
    })
}

// checks for previously deployed edgemicro internal proxies
Deployment.prototype.checkDeployedInternalProxies = function checkDeployedInternalProxies(options, cb) {
    //writeConsoleLog('log',{component: CONSOLE_LOG_TAG_COMP},'checking for previously deployed proxies')
    const opts = {
        organization: options.org,
        api: 'edgemicro-internal',
        baseuri: this.managementUri,
        debug: options.debug
    };

    if (options.token) {
        opts.token = options.token;
    } else {
        opts.username = options.username;
        opts.password = options.password;
    }
   // const that = this;
   apigeeUtils.listDeployments(opts, function(err /*, proxies */) {
        if (err) {
            if (err.message.includes("404")) {
                return cb(null, options);
            } else {
                return cb(err, options);    
            }            
        }
        else {
            options.internaldeployed = true;
            cb(null, options);
        }
    });
}

// checks for previously deployed edgemicro proxies
Deployment.prototype.checkDeployedProxies = function checkDeployedProxies(options, cb) {
    //writeConsoleLog('log',{component: CONSOLE_LOG_TAG_COMP},'checking for previously deployed proxies')
    const opts = {
        organization: options.org,
        api: 'edgemicro-auth',
        baseuri: this.managementUri,
        debug: options.debug
    };

    if (options.token) {
        opts.token = options.token;
    } else {
        opts.username = options.username;
        opts.password = options.password;
    }
    //const that = this;
    apigeeUtils.listDeployments(opts, function(err /*, proxies */) {
        if (err) {
            if (err.message.includes("404")) {
                return cb(null, options);
            } else {
                return cb(err, options);    
            }            
        }
        else {
            options.deployed = true;
            cb(null, options);
        }
    });
}

function setEdgeMicroInternalEndpoint(file, runtimeUrl) {
  const endpoint = "https://edgemicroservices.apigee.net";
  var content = fs.readFileSync(file, 'utf-8');
  content = content.replace(endpoint, runtimeUrl);
  fs.unlinkSync(file);
  debug('editing authentication url');
  fs.writeFileSync(file, content, 'utf8');  
}

function editVirtualHosts(file, virtualhosts) {
    if (virtualhosts === DEFAULT_HOSTS) return;
    var beginVH = "<VirtualHost>";
    var endVH = "</VirtualHost>";
    var defaultVH = "<VirtualHost>default</VirtualHost>";
    var secureVH = "<VirtualHost>secure</VirtualHost>";
    var content = fs.readFileSync(file, 'utf8');
    var virtualhost = virtualhosts.split(",");
    var newcontent;

    if (virtualhost.length === 1 && !virtualhost.includes('default') && !virtualhost.includes('secure')) {
        content = content.replace(defaultVH, beginVH + virtualhost[0] + endVH);
        newcontent = content.replace(secureVH, '');
    } else if (virtualhost.length === 1) {
        if (!virtualhost.includes('default')) {
            //remove default
            content = content.replace(defaultVH, '');
        } else if (!virtualhost.includes('secure')) {
            //remove secure
            content = content.replace(secureVH, '');
        }
    } else {
        virtualhost.forEach(function(element) {
            if (element !== 'default' && element !== 'secure') {
                content = content.replace(defaultVH, defaultVH + "\n" + beginVH + element + endVH);
            }
        });
        if (!virtualhost.includes('default')) {
            content = content.replace(defaultVH, '');
        }
        if (!virtualhost.includes('secure')) {
            content = content.replace(secureVH, '');
        }
    }

    fs.unlinkSync(file);
    debug('editing virtual hosts');
    fs.writeFileSync(file, content, 'utf8');

}

function editJavaCallout(file, nonCps, cb) {
    try{
        const content = fs.readFileSync(file, 'utf8');
        parseString(content, { explicitArray: false }, function(err, originXmlJsonObject) {
            if (err){
                writeConsoleLog('log',{component: CONSOLE_LOG_TAG_COMP},"error parsing JavaCallout.xml file: "+ err);
                cb();
            }
            if(nonCps){
                if( originXmlJsonObject.JavaCallout.Properties && originXmlJsonObject.JavaCallout.Properties.Property ){
                    if(Array.isArray( originXmlJsonObject.JavaCallout.Properties.Property )){
                        const noncpsObj = originXmlJsonObject.JavaCallout.Properties.Property.find(p => p['$'].name === 'org.noncps');
                        if(noncpsObj){
                            noncpsObj['_'] = 'true';
                        }else{
                            originXmlJsonObject.JavaCallout.Properties.Property.push({ _: 'true', '$': { name: 'org.noncps' }})
                        }
                    }else{
                        if( originXmlJsonObject.JavaCallout.Properties.Property['$'].name === 'org.noncps'){
                            originXmlJsonObject.JavaCallout.Properties.Property['_'] = 'true';
                        }else{
                            originXmlJsonObject.JavaCallout.Properties.Property = [originXmlJsonObject.JavaCallout.Properties.Property,{ _: 'true', '$': { name: 'org.noncps' }}]
                        }
                    }
                }else{
                    originXmlJsonObject.JavaCallout.Properties = { Property: { _: 'true', '$': { name: 'org.noncps' }} };
                }
            } else{
                if(Array.isArray( originXmlJsonObject.JavaCallout.Properties.Property )){
                    originXmlJsonObject.JavaCallout.Properties.Property = originXmlJsonObject.JavaCallout.Properties.Property.filter(p => p['$'].name !== 'org.noncps');
                }else{
                    if( originXmlJsonObject.JavaCallout.Properties !== '' && originXmlJsonObject.JavaCallout.Properties.Property['$'].name === 'org.noncps'){
                        originXmlJsonObject.JavaCallout.Properties = '';
                    }
                }
            }
            var builder = new xml2js.Builder();
            var modifiedXmlContent = builder.buildObject(originXmlJsonObject);
            fs.unlinkSync(file);
            debug('editing JavaCallOut');
            fs.writeFileSync(file, modifiedXmlContent, 'utf8');
            cb();
        });

    }catch (err){
        debug(err);
        cb();
    }
}

Deployment.prototype.deployProxyWithPassword = function deployProxyWithPassword(managementUri, authUri, options, dir, callback) {
    assert(dir, 'dir must be configured')
    assert(callback, 'callback must be present')
    var opts = {
        organization: options.org,
        environments: options.env,
        baseuri: managementUri,
        debug: options.debug,
        verbose: options.verbose,
        api: options.proxyName,
        directory: dir,
        virtualhosts: options.virtualHosts || DEFAULT_HOSTS,
        nonCps: options.noncpsOrg
    };

    if (options.token) {
        opts.token = options.token;
    } else {
        opts.username = options.username;
        opts.password = options.password;
    }
    editVirtualHosts(dir + "/apiproxy/proxies/default.xml", opts.virtualhosts);

    var tasks = [];

    tasks.push(function(cb) {
        // set org.nonCps value
        editJavaCallout(dir + "/apiproxy/policies/JavaCallout.xml", opts.nonCps, cb)
    })

    async.series(tasks, function(err /*, results */) {

        //set the edgemicro-internal endpoint in edgemicro-auth
        if (options.runtimeUrl) {
            setEdgeMicroInternalEndpoint(dir + "/apiproxy/policies/Authenticate-Call.xml", options.runtimeUrl);
        } 
        writeConsoleLog('log',{component: CONSOLE_LOG_TAG_COMP},'Give me a minute or two... this can take a while...');
        apigeeUtils.deployProxy(opts, function(err) {
            if (err) {
                if (err.code === 'ECONNRESET' && err.message === 'socket hang up') {
                    err.message = 'Deployment timeout. Please try again or use the --upload option.'
                } else if (err.message === 'Get API info returned status 401') {
                    err.message = 'Invalid credentials or not sufficient permission. Please correct and try again.'
                }
    
                return callback(err);
            } else {
                writeConsoleLog('log',{component: CONSOLE_LOG_TAG_COMP},'App %s deployed.', options.proxyName);
                callback(null, options.runtimeUrl ? authUri + '/publicKey' : util.format(authUri + '/publicKey', options.org, options.env));
            }
        });
    })
}
