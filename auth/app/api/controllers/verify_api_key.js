'use strict';

var debug = require('debug')('apiKey');
var jwt = require('../helpers/jwt');

module.exports = {
  verifyApiKey: verifyApiKey
};

function verifyApiKey(req, res, next) {
  debug('call to verifyApiKey with request', req);
 	var apigee = require('apigee-access');
  var oauth = apigee.getOAuth();
  var body = req.swagger.params.body.value;
  oauth.verifyApiKey(req, body, function (err, result) {
    if (err) {
      sendError(500, res, err.message);
    } else {
      if (result.error) {
      		sendError(401, res, result.error);
      } else if (result.status) {
        if (result.status === 'approved') {
          // simply return an array of approved products
          convertToJWT(result, function(err, signed) {
              if (err) { return next(err); }
              res.setHeader('Cache-Control', 'no-store');
              res.setHeader('Pragma', 'no-cache');
              res.json(signed);
            });
        } else {
          sendError(403, res, result.status);
        }
      }
    }
  });
}

/*convert apiKey attributes to JWT
sample apigeeToken
{
    "issued_at": 1437582043159,
    "status": "approved",
    "expires_in": 0,
    "developer_app_name": "edgemicro-se",
    "developer_id": "demo_bvt@@@PtcA2p81xnlkfM3H",
    "developer_email": "apigeek@apigee.com",
    "apiproduct_name": "edgemicro-se",
    "developer_app_id": "e4284405-554c-401a-b1b4-a848ea5a800f",
    "client_id": "XgaDRARM7xHl2U0LEIlvAFKwVbeUL0aR",
    "attributes": {
        "apiproduct_developer_quota_limit": "10",
        "apiproduct_developer_quota_interval": "1",
        "apiproduct_developer_quota_timeunit": "minute",
        "DisplayName": "edgemicro-se",
        "Notes": "",
        "client_secret": "sp6d9ysv3S3JG8K6",
        "redirection_uris": null,
        "apiproduct_access": "public"
    },
    "developer": {
        "apps": [
            "edgemicro-se"
        ],
        "app_name": "edgemicro-se",
        "app_id": "e4284405-554c-401a-b1b4-a848ea5a800f",
        "id": "demo_bvt@@@PtcA2p81xnlkfM3H",
        "attributes": {
            "created_by": "prabhat@apigee.com",
            "lastName": "jha",
            "last_modified_by": "prabhat@apigee.com",
            "last_modified_at": "1437581958704",
            "status": "active",
            "email": "apigeek@apigee.com",
            "created_at": "1437581958704",
            "userName": "apigeek",
            "firstName": "apigeek"
        }
    },
    "app": {
        "apiproducts": [
            "edgemicro-se"
        ],
        "scopes": [],
        "attributes": {
            "created_by": "prabhat@apigee.com",
            "status": "approved",
            "appFamily": "default",
            "DisplayName": "edgemicro-se",
            "Notes": "",
            "id": "e4284405-554c-401a-b1b4-a848ea5a800f",
            "callbackUrl": "",
            "last_modified_by": "prabhat@apigee.com",
            "last_modified_at": "1437582043141",
            "name": "edgemicro-se",
            "appParentStatus": "active",
            "appParentId": "demo_bvt@@@PtcA2p81xnlkfM3H",
            "created_at": "1437582043141",
            "appType": "Developer",
            "accessType": ""
        }
    }
}*/

function convertToJWT(apigeeToken, cb) {
  var token = {
    application_name: apigeeToken.developer_app_name,
    client_id: apigeeToken.client_id,
    scopes: apigeeToken.app && apigeeToken.app.scopes ? apigeeToken.app.scopes : [],
    api_product_list: apigeeToken.app && apigeeToken.app.apiproducts ? apigeeToken.app.apiproducts : []
  };

  var options = {
    algorithm: 'RS256',
    expiresInSeconds: 0
  };

  jwt.sign(token, options, cb);
}


function sendError(errCode, resp, message) {
  if (message) {
    resp.writeHead(errCode, {
      'content-type': 'application/json'
    });
    var err = { message: message };
    resp.end(JSON.stringify(err));
  } else {
    resp.writeHead(errCode);
    resp.end();
  }
}

function sendJson(errCode, resp, result) {
  resp.writeHead(errCode, {
    'content-type': 'application/json'
  });
  resp.end(JSON.stringify(result));
}
