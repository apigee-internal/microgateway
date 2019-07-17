"use strict";

//const util = require("util");
//const debug = require("debug")("jwkrotatekey");
//const request = require("request");
var deployAuthLib = require('./deploy-auth');
var deployAuth;

const path = require('path');

const UpgradeAuth = function() {

}

module.exports = function() {
    return new UpgradeAuth();
}

UpgradeAuth.prototype.upgradeauth = function upgradeauth(options /*, cb */) {
    const opts = {
        org: options.org,
        env: options.env,
        username: options.username,
        password: options.password,
        basepath: '/edgemicro-auth',
        debug: false,
        verbose: true,
        proxyName: 'edgemicro-auth',
        directory: path.join(__dirname, '../..', 'node_modules', 'microgateway-edgeauth'),
        'import-only': false,
        'resolve-modules': false,
        virtualHosts: options.virtualhost || 'secure'
    };

    var edge_config = {
        managementUri: options.mgmtUrl || 'na',
        authUri: 'na',
        virtualhosts: opts.virtualHosts
    };

    if (options.token) {
        opts.token = options.token;
    } else {
        opts.username = options.username;
        opts.password = options.password;
    }

    deployAuth = deployAuthLib(edge_config, null);

    deployAuth.deployProxyWithPassword(options.mgmtUrl, 'na', opts, opts.directory, function(err /*, result */ ) {
        if (err) {
            console.log(err);
        }
    });

}
