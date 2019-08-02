'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const rewire = require('rewire')

const tokenMod = rewire('../cli/lib/token.js');

let jwtFilePath = path.join(__dirname, './fixtures/jwt.txt');


var jwt = tokenMod();



class MockEdgeConfig {
	//
	constructor(stuff) {
		this.config = {}
		this.config.edge_config = stuff
	}
	//
	load(options) {
		return this.config
	}
}


describe('test token.js - jwt module', () => {

	it('decodes a jwt stored in a file', (done) => {
		const tokenData = jwt.decodeToken({file:jwtFilePath});
		assert.deepEqual(tokenData.header, { kid: '1', typ: 'JWT', alg: 'RS256' });
		assert.equal(tokenData.payload.aud, 'microgateway');
		done();
	});

	it('gets a public key from a base path with /publickey appended',(done) => {

		function myTestReq(options,cb) {
			var testUri = options.uri;
			assert("AUTHURI/publicKey" ===  testUri.substr(0,"AUTHURI/publicKey".length))
			var res = {
				'body' : "this is a big test"
			}
			var err = null
			cb(err,res)
		}

		var getPublicKey = tokenMod.__get__('getPublicKey')
		//
		tokenMod.__set__('request',myTestReq)

		getPublicKey('ORG',"ENV","AUTHURI",true,(err,body) => {
			assert(err === null)
			assert(body === "this is a big test") // call the right one
		})

		getPublicKey('ORG',"ENV","AUTHURI",false,(err,body) => {
			assert(err === null)
			assert(body === "this is a big test") // call the right one
		})

		done()

	})

	it('gets a token',(done) => {

		function myTestReq2(options,cb) {
			var testUri = options.uri;
			assert("AUTHURI/token" ===  testUri.substr(0,"AUTHURI/token".length))
			var res = {
				'body' : "this is a big test"
			}
			var err = null
			cb(err,res)
		}
		//
		var fauxEdgeconfig = new MockEdgeConfig({
			'managementUri' : 'https://api.e2e.NOT.net',
			'authUri' : "AUTHURI"
		})
		//
		tokenMod.__set__('request',myTestReq2)
		tokenMod.__set__('edgeconfig',fauxEdgeconfig)
		
		//
		var options = {
			'org' : "ORG",
			'env' : "ENV",
			'id' : "THISID",
			'secret' : "not going to tell",
			'key' : "a9ahf9ahfshf"
		}

		var cb = (err,body) => {
			assert(err === null)
			assert(body === "this is a big test") // call the right one
		}

		jwt.getToken(options, cb);

		var fauxEdgeconfig2 = new MockEdgeConfig({
			'managementUri' : 'https://api.e2e.apigee.net',
			'authUri' : "AUTHURI"
		})
		tokenMod.__set__('edgeconfig',fauxEdgeconfig2)
		//
		jwt.getToken(options, cb);

		done()
	})


	it('verifies a token',(done) => {

		class MOCKJwt {
			constructor() {
			}
			verify(token, certificate, opts, cb) {
				var result = "things are good"
				cb(null, result)
			}
		}

		function myTestReq2(options,cb) {
			var testUri = options.uri;

			console.log(options)
			//assert("AUTHURI/token" ===  testUri.substr(0,"AUTHURI/token".length))
			var res = {
				'body' : "this is a big test"
			}
			var err = null
			cb(err,res)
		}
		//
		var fauxEdgeconfig = new MockEdgeConfig({
			'managementUri' : 'https://api.e2e.NOT.net',
			'authUri' : "AUTHURI"
		})
		//
		tokenMod.__set__('request',myTestReq2)
		tokenMod.__set__('edgeconfig',fauxEdgeconfig)
		var fauxJWT = new MOCKJwt()
		tokenMod.__set__('jwt',fauxJWT)

		//
		var options = {
			'org' : "ORG",
			'env' : "ENV",
			'id' : "THISID",
			'secret' : "not going to tell",
			'key' : "a9ahf9ahfshf",
			'file' : jwtFilePath
		}

		var cb = (err,body) => {
			console.log(err)
			console.log(body)
			/*
			assert(err === null)
			assert(body === "this is a big test") // call the right one
			*/
		}

		jwt.verifyToken(options, cb);

		var fauxEdgeconfig2 = new MockEdgeConfig({
			'managementUri' : 'https://api.e2e.apigee.net',
			'authUri' : "AUTHURI"
		})
		tokenMod.__set__('edgeconfig',fauxEdgeconfig2)
		//
		jwt.verifyToken(options, cb);

		done()
	})

});


/*

Token.prototype.verifyToken = function(options, cb) {

  assert(options.file);
  assert(options.org)
  assert(options.env)
  const targetPath = configLocations.getSourcePath(options.org, options.env);
  cb = cb || function() { }

  const key = options.key;
  const secret = options.secret;
  const keys = { key: key, secret: secret };

  const token = fs.readFileSync(path.resolve(options.file), 'utf8').trim();   

  const config = edgeconfig.load({ source: targetPath, keys: keys });

  const authUri = config.edge_config['authUri'];
  this.isPublicCloud = config.edge_config['managementUri'] === 'https://api.enterprise.apigee.com' ||
    config.edge_config['managementUri'] === 'https://api.e2e.apigee.net';

  getPublicKey(options.org, options.env, authUri, this.isPublicCloud, function(err, certificate) {
    //
    if (err) {
      cb(err);
      return printError(err);
    }
    //
    const opts = {
      algorithms: ['RS256'],
      ignoreExpiration: false
    };

    jwt.verify(token, certificate, opts, function(err, result) {
      if (err) {
        cb(err)
        return printError(err);
      }
      console.log(result);
      cb(null,result)
    });
  });
*/