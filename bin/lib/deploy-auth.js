'use strict';
const tmp = require('tmp');
const cpr = require('cpr');
const rimraf = require('rimraf');
const apigeetool = require('apigeetool');
const request = require('request');
const assert = require('assert');
const path = require('path');
const async = require('async')
const util = require('util')
const fs = require('fs')
const DEFAULT_HOSTS = 'default,secure';
const url = require('url');
const _ =require('lodash')

const Deployment = function(edge_config,virtualHosts ) {
  this.managementUri = edge_config.managementUri;
  this.authUri = edge_config.authUri;
  this.virtualHosts = virtualHosts;
  assert(this.authUri);
  assert(this.managementUri);
}
module.exports = function(edge_config,virtualHosts){
  return new Deployment(edge_config,virtualHosts);
}
// deploys internal apiproxy to specified managementUrl
Deployment.prototype.deployEdgeMicroInternalProxy = function deployEdgeMicroInternalProxy(options, callback) {
  const opts = {
    organization: options.org,
    environments: options.env,
    baseuri: this.managementUri,
    username: options.username,
    password: options.password,
    debug: options.debug,
    verbose: options.debug,
    api: 'edgemicro-internal',
    directory:  path.join(__dirname,'..','..','auth'),
    'import-only': false,
    'resolve-modules': false,
    virtualhosts: this.virtualHosts || 'default'
  };

  apigeetool.deployProxy(opts, function(err, res) {
    if (err) {
      return callback(err);
    }

    callback(null, res);
  });
}

Deployment.prototype.deployWithLeanPayload = function deployWithLeanPayload( options, callback) {
  const authUri = this.authUri;
  const managementUri = this.managementUri;

  var tmpDir = tmp.dirSync({ keep: true, dir: path.resolve(__dirname, '..', '..') });
  var tasks = [];
  var deployResultNdx = 5; // if files are added to exclusion this might need changing

  // copy bin folder into tmp
  tasks.push(function(cb) {
    console.log('copy auth app into tmp dir');
    cpr(path.resolve(__dirname, '..', '..', 'auth', 'app'), tmpDir.name, cb);
  });

  // copy bin folder into tmp
  tasks.push(function(cb) {
    console.log('copy config into tmp dir');
    cpr(path.resolve(__dirname, '..', '..', 'config'), tmpDir.name+'/config', cb);
  });

  // deploy lean payload
  tasks.push(function(cb) {
    const dir = tmpDir.name;
    deployProxyWithPassword(managementUri,authUri, options, dir, cb);
  });

  // delete tmp dir
  tasks.push(function(cb) {
    rimraf(tmpDir.name, cb);
  })

  async.series(tasks, function(err, results) {
    if (err) {
      return callback(err);
    }

    // pass JWT public key URL through callback
    callback(null, results[deployResultNdx]);
  })
}

// checks for previously deployed edgemicro proxies
Deployment.prototype.checkDeployedProxies = function checkDeployedProxies(options, cb) {
  console.log('checking for previously deployed proxies')
  const opts = {
    organization: options.org,
    environment: options.env,
    baseuri: this.managementUri,
    username: options.username,
    password: options.password,
    debug: options.debug
  };
  const that = this;
  apigeetool.listDeployments(opts, function(err, proxies) {
    if (err) {
      return cb(err);
    }
    _.assign(options, proxies);
    cb(err, options)
  })
}


function deployProxyWithPassword(managementUri,authUri, options, dir, callback) {
  assert(dir, 'dir must be configured')
  assert(callback, 'callback must be present')
  var opts = {
    organization: options.org,
    environments: options.env,
    baseuri: managementUri,
    username: options.username,
    password: options.password,
    debug: options.debug,
    verbose: options.debug,
    api: options.proxyName,
    main: 'app.js',
    directory: dir,
    'base-path': '/edgemicro-auth',
    'import-only': false,
    'resolve-modules': false,
    virtualhosts: options.virtualHosts || DEFAULT_HOSTS
  };

  console.log('Give me a minute or two... this can take a while...');
  apigeetool.deployNodeApp(opts, function(err) {
    if (err) {
      if (err.code === 'ECONNRESET' && err.message === 'socket hang up') {
        err.message = 'Deployment timeout. Please try again or use the --upload option.'
      } else if (err.message === 'Get API info returned status 401') {
        err.message = 'Invalid credentials or not sufficient permission. Please correct and try again.'
      }

      return callback(err);
    }

    console.log('App %s added to your org. Now adding resources.', options.proxyName);
    opts.password = options.password; // override a apigeetool side-effect bug
    installJavaCallout(managementUri, opts, function(err) {
      if (err) {
        return callback(err);
      }
      console.log('App %s deployed.', options.proxyName);
      callback(null, options.url ? authUri + '/publicKey' : util.format(authUri + '/publicKey', options.org, options.env));

    });
  });
}


function installJavaCallout(managementUri, opts, cb) {

  var jarName = 'micro-gateway-products-javacallout-1.0.0.jar';
  // todo: revision?
  var addResourceUri = '%s/v1/organizations/%s/apis/%s/revisions/1/resources?name=%s&type=java';
  var uri = util.format(addResourceUri, managementUri, opts.organization, opts.api, jarName);

  var httpReq = request({
    uri: uri,
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    auth: {
      username: opts.username,
      password: opts.password
    }
  }, function(err, res) {
    err = translateError(err, res);
    if (err) {
      return cb(err);
    }

    var addStepDefinitionUri = '%s/v1/organizations/%s/apis/%s/revisions/1/stepdefinitions';
    uri = util.format(addStepDefinitionUri, managementUri, opts.organization, opts.api);
    var data = '<JavaCallout name=\'JavaCallout\'><ResourceURL>java://%s</ResourceURL><ClassName>io.apigee.microgateway.javacallout.Callout</ClassName></JavaCallout>';

    request({
      uri: uri,
      method: 'POST',
      headers: { 'Content-Type': 'application/xml' },
      auth: {
        username: opts.username,
        password: opts.password
      },
      body: util.format(data, jarName)
    }, function(err) {
      if (err) {
        return cb(err);
      }

      var addStepUri = '%s/v1/organizations/%s/apis/%s/revisions/1/proxies/default/steps?name=JavaCallout&flow=PostFlow&enforcement=response';
      uri = util.format(addStepUri, managementUri, opts.organization, opts.api);

      request({
        uri: uri,
        method: 'POST',
        auth: {
          username: opts.username,
          password: opts.password
        }
      }, function(err, res) {
        cb(err, res)
      });
    });
  });

  var fileStream = fs.createReadStream(path.resolve(__dirname, jarName));
  fileStream.pipe(httpReq);
}

function translateError(err, res) {
  if (!err && res.statusCode >= 400) {

    var msg = 'cannot ' + res.request.method + ' ' + url.format(res.request.uri) + ' (' + res.statusCode + ')';
    err = new Error(msg);
    err.text = res.body;
    res.error = err;
  }
  return err;
}