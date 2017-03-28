 /****************************************************************************
 The MIT License (MIT)

 Copyright (c) 2016 Apigee Corporation

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
 const alg = 'RS256';
 const typ = 'JWT';
 
 //private key used for signing JWT
 var key = context.getVariable("privateKey");

 //get api product list
 var apiProducts = JSON.parse(context.getVariable('apiProducts')).ApiProducts.ApiProduct || [];
 
 var apiProductsList = [];
 //get only the product name; status is not used/sent
 apiProducts.forEach(function(apiProduct){
    apiProductsList.push(apiProduct.Name); 
 });

 //build jwt claims
 var token_payload = {
    "application_name": context.getVariable("apigee.developer.app.name"),
    "client_id": context.getVariable("apigee.client_id"),
    "scopes": [],
    "api_product_list": apiProductsList,
    "iat": (new Date()).getTime(),
    "aud": ["microgateway"],
    "iss": context.getVariable("proxyProto") + "://" + context.getVariable("proxyHost") + context.getVariable("proxy.basepath")+context.getVariable("proxy.pathsuffix"),
    //create a unique identifier as per https://stackoverflow.com/questions/105034/create-guid-uuid-in-javascript
    "jti": 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
                return v.toString(16);
            })
 };
 
 //build jwt header
 var token_header = {
    "typ": typ,
    "alg": alg     
 };
 
 //prepare response object
 var jws = {
     token: context.getVariable("jwt_jwt")
 };

 //send response
 context.setVariable("request.header.Content-Type","application/json");
 context.setVariable("request.header.Cache-Control","no-store");
 context.setVariable("request.content", JSON.stringify(jws));
