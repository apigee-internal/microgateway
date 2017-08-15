"use strict";

const util = require("util");
const debug = require("debug")("jwkrotatekey");
const request = require("request");
const apigeetool = require('apigeetool');
const path = require('path');

const UpgradeAuth = function () {

}

module.exports = function () {
  return new UpgradeAuth();
}

UpgradeAuth.prototype.upgradeauth = function upgradeauth(options, cb) {
    var authpath = __dirname;
    var len = authpath.indexOf('/cli/lib');
    const opts = {
        organization: options.org,
        environments: options.env,
        baseuri: options.baseuri || "https://api.enterprise.apigee.com",
        username: options.username,
        password: options.password,
        basepath: '/edgemicro-auth',
        verbose: true,
        api: 'edgemicro-auth',
        directory:  path.join(authpath.substring(0, len),'node_modules','microgateway-edgeauth'),
        'import-only': false,
        'resolve-modules': false,
        virtualhosts: options.virtualhost || 'secure'
      };

    apigeetool.deployProxy(opts, function(err, res) {
        if (err) {
            console.error(err);
            process.exit(1);
            cb ? cb(err) : process.exit(1);
            return;
        } else {
            console.log("edgemicro-auth proxy upgraded");
            process.exit(0);
        }
    });
}
  
