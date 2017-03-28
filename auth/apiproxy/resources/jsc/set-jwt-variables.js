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
 var apiProducts = JSON.parse(context.getVariable('apiProducts')).ApiProducts.ApiProduct || [];

 var apiProductsList = [];
 try {
     //get only the product name; status is not used/sent
     apiProducts.forEach(function(apiProduct){
        apiProductsList.push(apiProduct.Name);
     });
 }catch(err){
     apiProductsList.push(apiProducts.Name);
 }

 var scope = [];
 try {
    context.setVariable("scope",context.getVariable("oauthv2accesstoken.AccessTokenRequest.scope").split(" ") || []);
 } catch (err) {
     scope = [];
 }

 context.setVariable("apiProductList", apiProductsList);
 context.setVariable("iss", context.getVariable("proxyProto") + "://" + context.getVariable("proxyHost") + context.getVariable("proxy.basepath")+context.getVariable("proxy.pathsuffix"));
 context.setVariable("jti", 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
                return v.toString(16);
            }));
