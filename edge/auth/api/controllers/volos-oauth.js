/****************************************************************************
 The MIT License (MIT)

 Copyright (c) 2015 Apigee Corporation

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
 ****************************************************************************/
'use strict';

var debug = require('debug')('oauth');
var jwt = require('../helpers/jwt');

module.exports = {
  token: token
};

function token(req, res, next) {
  handleAccessToken()(req, res, next);
}

function oauth(req) {
  return req.volos.resources[req.swagger.path['x-volos-oauth-service']];
}

function handleAccessToken() {

  return function(req, res) {
    debug('Express accessToken');
    getRequestBody(req, function(body) {
      req.body = body;

      console.log(body)
      console.log( req.headers.authorization)
      console.log(req);
      oauth(req).generateToken(body, { authorizeHeader: req.headers.authorization, request: req },
        function(err, result) {
          if (err) {
            console.log(err)
            debug('Access token error: %s', err);
            sendError(err, res);
          } else {
            translateToken(result, function(err, signed) {
              if (err) { return next(err); }

              res.setHeader('Cache-Control', 'no-store');
              res.setHeader('Pragma', 'no-cache');
              res.json(signed);
            });
          }
        });
    });
  };
}

/*
 Apigee token response example:

 "access_token" : "8n8XrGGgw8ipQq7dQmwuIgpyvhMP",
 "api_product_list" : "[foo]",
 "api_profile_name" : null,
 "application_name" : "10317817-23b2-427c-8677-df9ddc033e06",
 "client_id" : "0dKNR3krOdSMG9spFvC0OfUMmVw0IMI8",
 "developer_email" : "remote-proxy@apigee.com",
 "expires_in" : 29,
 "issued_at" : 1432067398420,
 "organization_id" : "0",
 "organization_name" : "sganyo",
 "refresh_count" : 0,
 "refresh_token" : null,
 "refresh_token_expires_in" : 0,
 "refresh_token_status" : null,
 "scope" : "",
 "state" : null,
 "status" : "approved",
 "token_type" : "bearer"

JTW Token example:

 application_name: 'd240b2c9-92d0-45f8-80b0-1084dde798a1',
 client_id: '1eqGJ9EiGstYeAgar1mAv1t437iGvAvI'
 scopes: ['read'],
 api_product_list: ['hotels-product','customers'],
*/

function translateToken(apigeeToken, cb) {

  var token = {
    application_name: apigeeToken.application_name,
    client_id: apigeeToken.client_id,
    scopes: apigeeToken.scope ? apigeeToken.scope.split(' ') : [],
    api_product_list: apigeeToken.api_product_list ? apigeeToken.api_product_list.slice(1, -1).split(',') : []
  };

  var options = {
    algorithm: 'RS256',
    expiresInSeconds: apigeeToken.expires_in
  };

  jwt.sign(token, options, cb);
}

function sendError(err, res) {

  var rb = {
    error_description: err.message
  };
  if (err.state) {
    rb.state = err.state;
  }
  if (err.code) {
    rb.error = err.code;
  } else {
    rb.error = 'server_error';
  }
  if (err.headers) {
    _.each(_.keys(err.headers), function(name) {
      res.setHeader(name, err.headers[name]);
    });
  }
  res.json(err.statusCode, rb);
}

function getRequestBody(req, cb) {

  if (req.complete) { return cb(req.body); }
  var body = '';
  req.setEncoding('utf8');
  req.on('readable', function() {
    var chunk;
    do {
      chunk = req.read();
      if (chunk) {
        body += chunk;
      }
    } while (chunk);
  });
  req.on('end', function() {
    cb(body);
  });
}
