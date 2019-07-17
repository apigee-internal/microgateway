"use strict";

const pem = require("pem");
const util = require("util");
const debug = require("debug")("jwkrotatekey");
//const commander = require('commander');
const request = require("request");
const async = require('async');


function createCert(cb) {

    const options = {
        selfSigned: true,
        days: 1
    };

    pem.createCertificate(options, cb);
}

function generateCredentialsObject(options) {
    if (options.token) {
        return {
            "bearer": options.token
        };
    } else {
        return {
            user: options.username,
            pass: options.password
        };
    }
}

function isCPS(property) {
    var cpsenabled = false;
	debug(property);
    for (var p in property) {
        if (property.hasOwnProperty(p)) {
            if (property[p].name ===  "features.isCpsEnabled" && property[p].value ===  "true") {
                cpsenabled = true;
            }
        }
    }
	return cpsenabled;	
}

function updateNonCPSKVM(options, serviceKey, newCertificate, newPublicKey, oldPublicKey) {
	
	var updatekvmuri = util.format("%s/v1/organizations/%s/environments/%s/keyvaluemaps/%s",
    		options.baseuri, options.org, options.env, options.kvm);
		
    var payload = {
        "name": options.kvm,
        "encrypted": "true",
        "entry": [{
                "name": "private_key",
                "value": serviceKey
            },
            {
                "name": "private_key_kid",
                "value": options.kid
            },
            {
                "name": "public_key",
                "value": newCertificate
            },
            {
                "name": "public_key1",
                "value": newPublicKey
            },
            {
                "name": "public_key1_kid",
                "value": options.kid
            },
            {
                "name": "public_key2",
                "value": oldPublicKey
            },
            {
                "name": "public_key2_kid",
                "value": options.oldkid
            }
        ]
    };
	debug(payload);	
    request({
       uri: updatekvmuri,
       auth: generateCredentialsObject(options),
       method: "POST",
       json: payload
    }, function(err, res /*, body */) {
       if (err || res.statusCode > 299) {
           console.error(err);
       } else {
           console.log("Key Rotation successfully completed!");
       }
    });	
}

function checkKVMEntry(options, key) {
	var entryuri = util.format("%s/v1/organizations/%s/environments/%s/keyvaluemaps/%s/entries/%s",
	options.baseuri, options.org, options.env, options.kvm, key);

    request({
        uri: entryuri,
        auth: generateCredentialsObject(options),
        method: "GET",
    }, function(err, res /*, body */) {
        if (err || res.statusCode > 299) return false;
		else return true;
    });						
}

function insertKVMEntry(options, key, value, cb) {
	var entryuri = util.format("%s/v1/organizations/%s/environments/%s/keyvaluemaps/%s/entries",
	options.baseuri, options.org, options.env, options.kvm);
	var entry = {
		"name": key,
		"value": value
	};
    debug(entry);
    request({
        uri: entryuri,
        auth: generateCredentialsObject(options),
        method: "POST",
		json: entry
    }, function(err, res /*, body */) {
        if (err || res.statusCode > 299) cb(err);
		else cb(null, true);
    });		
	
}

function updateKVMEntry(options, key, value, cb) {
	var entryuri = util.format("%s/v1/organizations/%s/environments/%s/keyvaluemaps/%s/entries/%s",
	options.baseuri, options.org, options.env, options.kvm, key);
	var entry = {
		"name": key,
		"value": value
	};
    debug(entry);
    request({
        uri: entryuri,
        auth: generateCredentialsObject(options),
        method: "POST",
		json: entry
    }, function(err, res /*, body */) {
        if (err || res.statusCode > 299) cb(err);
		else cb(null, true);
    });	
	
}

function updateOrInsertEntry (options, key, value, cb) {
	if (checkKVMEntry(options, key)) {
		debug("entry exists, updating..");
		updateKVMEntry(options, key, value, function(err /*, result */){
			if (err) cb(err);
			else cb(null, true);
		});
	} else {
		debug("entry does not exist. inserting entry...")
		insertKVMEntry(options, key, value, function(err /*, result */){
			if (err) cb(err);
			else cb(null, true);
		});
	}
}

function updateCPSKVM(options, serviceKey, newCertificate, newPublicKey, oldPublicKey) {
	var updatecpskvmuri = util.format("%s/v1/organizations/%s/environments/%s/keyvaluemaps/%s/entries/",
                    options.baseuri, options.org, options.env,options.kvm);	
	
	async.parallel([
		function (cb) {
			var entry = {
				name: "private_key",
				value: serviceKey
			};
			debug(entry);
            request({
                uri: updatecpskvmuri+"private_key",
                auth: generateCredentialsObject(options),
                method: "POST",
                json: entry
            }, function(err, res, body) {
                cb(err, body);
            });						
		},
		function (cb) {
			var entry = {
				name: "private_key_kid",
				value: options.kid
			};
			debug(entry);
            request({
                uri: updatecpskvmuri+"private_key_kid",
                auth: generateCredentialsObject(options),
                method: "POST",
                json: entry
            }, function(err, res, body) {
                cb(err, body);
            });						
		},
		function (cb) {
			var entry = {
				name: "public_key",
				value: newCertificate
			};
			debug(entry);
            request({
                uri: updatecpskvmuri+"public_key",
                auth: generateCredentialsObject(options),
                method: "POST",
                json: entry
            }, function(err, res, body) {
                cb(err, body);
            });						
		},
		function (cb) {
			var entry = {
				name: "public_key1",
				value: newPublicKey
			};
			debug(entry);
            request({
                uri: updatecpskvmuri+"public_key1",
                auth: generateCredentialsObject(options),
                method: "POST",
                json: entry
            }, function(err, res, body) {
                cb(err, body);
            });						
		},
		function (cb) {
			var entry = {
				name: "public_key1_kid",
				value: options.kid
			};
			debug(entry);
            request({
                uri: updatecpskvmuri+"public_key1_kid",
                auth: generateCredentialsObject(options),
                method: "POST",
                json: entry
            }, function(err, res, body) {
                cb(err, body);
            });						
		},
		function (cb) {
			updateOrInsertEntry(options, "public_key2", oldPublicKey, function(err, result) {
				cb(err, result); 
			});				
		},
		function (cb) {
			updateOrInsertEntry(options, "public_key2_kid", options.oldkid, function(err, result) {
				cb(err, result); 
			});				
		}												
	], function (err /*, results */) {
		if (err) {
			console.error(err);
			process.exit(1);
		} else {
			console.log("Key Rotation successfully completed!");
		}
    });
}

const RotateKey = function () {

}

module.exports = function () {
  return new RotateKey();
}

RotateKey.prototype.rotatekey = function rotatekey(options /*, cb */) {

    options.baseuri = options.mgmtUrl || "https://api.enterprise.apigee.com";
    options.kvm = "microgateway";
    options.kid =  options.kid || "2";
	options.oldkid = options["prevKid"] || "1";

    async.series([
    	function(cb) {
		    var privateKeyURI = util.format("%s/v1/organizations/%s/environments/%s/keyvaluemaps/%s/entries/private_key",
		        options.baseuri, options.org, options.env, options.kvm);
		    console.log("Checking if private key exists in the KVM...");
		    request({
		        uri: privateKeyURI,
		        auth: generateCredentialsObject(options),
		        method: "GET"
		    }, function (err, resp, body) {
		    	if (err) cb(err);
				else cb(null,body);
		    }); 		
    	},
		function(cb) {
			console.log("Checking for certificate...");
            var publicKeyURI = util.format("https://%s-%s.apigee.net/edgemicro-auth/publicKey",
                options.org, options.env);			
            request({
                uri: publicKeyURI,
                auth: generateCredentialsObject(options),
                method: "GET"
            }, function (err, resp, body) {
				if (err) cb(err);
				else cb (null, body);	
            });
		}
    ], function(err, results){
    	if (err) {
    		console.error(err);
			process.exit(1);
    	} else {
    		var oldCertificate = results[1];
			console.log("Found Certificate");
			//debug("Old Certificate: \n" + oldCertificate);
			async.series([
				function(cb) {
					pem.getPublicKey(oldCertificate, function(e, oldPublicKey) {
						if (e) cb(e);
						else cb(null, oldPublicKey);
					});
					
				}, 
				function(cb) {
					console.log("Generating New key/cert pair...");
					createCert(function(e, newkeys) {
						if (e) cb(e);
						else cb(null, newkeys);
					});								
				}
			], function(e, res){
				if (err) {
					console.error(e);
					process.exit(1);
				} else {
					console.log ("Extract new public key");
					var newCertificate = res[1].certificate;
					pem.getPublicKey(newCertificate, function(ee, newkey) {
						if (ee) {
							console.error(ee);
							process.exit(1);
						} else {
							debug("Checking for CPS...");
							var cpsuri = util.format("%s/v1/o/%s", options.baseuri, options.org);
							request({
                                uri: cpsuri,
                                auth: generateCredentialsObject(options),
                                method: "GET"
                            }, function(eee, rs, body) {
								var payload = JSON.parse(body);
								var property = payload.properties.property;
								if (isCPS(property)) {
									debug("CPS is enabled");
									updateCPSKVM(options, res[1].serviceKey, newCertificate, newkey.publicKey, res[0].publicKey);
								} else {
									debug("CPS is not enabled");
									updateNonCPSKVM(options, res[1].serviceKey, newCertificate, newkey.publicKey, res[0].publicKey);
								}
							});							
						}
					});
				}
			});			
    	}
    });
}
