//
const yaml = require('js-yaml');
const fs   = require('fs');

var nargs = process.argv.length;


function isBoolean(str) {
    if ( typeof str === "boolean" ) return(true)
    if ( typeof str === "string" ) {
        var tstr = str.toLowerCase()
        if ( tstr === 'false' ||  tstr === 'true' ) {
            //
            return(true)
        }
    }
    return(false)
}

if ( nargs > 2 ) {

    var fpos = 2
    //
    var fileName = process.argv[fpos]

/*
    var testingOne = {
        "edge_config": {
          "bootstrap": "https://edgemicroservices.apigee.net/edgemicro/bootstrap/organization/leddyr-eval/environment/test",
          "jwt_public_key": "https://leddyr-eval-test.apigee.net/edgemicro-auth/publicKey",
          "managementUri": "https://api.enterprise.apigee.com",
          "vaultName": "microgateway",
          "authUri": "https://%s-%s.apigee.net/edgemicro-auth",
          "baseUri": "https://edgemicroservices.apigee.net/edgemicro/%s/organization/%s/environment/%s",
          "bootstrapMessage": "Please copy the following property to the edge micro agent config",
          "keySecretMessage": "The following credentials are required to start edge micro",
          "products": "https://leddyr-eval-test.apigee.net/edgemicro-auth/products"
        },
        "edgemicro": {
          "port": 8000,
          "max_connections": 1000,
          "config_change_poll_interval": 10,
          "logging": {
            "level": "error",
            "dir": "/var/tmp",
            "stats_log_interval": 60,
            "rotate_interval": 24
          },
          "plugins": {
            "sequence": [
              "oauth",
              "quota"
            ]
          }
        },
        "headers": {
          "x-forwarded-for": true,
          "x-forwarded-host": true,
          "x-request-id": true,
          "x-response-time": true,
          "via": true
        },
        "oauth": {
          "allowNoAuthorization": false,
          "allowInvalidAuthorization": false,
          "gracePeriod": 10,
          "verify_api_key_url": "https://leddyr-eval-test.apigee.net/edgemicro-auth/verifyApiKey"
        },
        "analytics": {
          "uri": "https://edgemicroservices.apigee.net/edgemicro/axpublisher/organization/leddyr-eval/environment/test",
          "bufferSize": 10000,
          "batchSize": 500,
          "flushInterval": 5000
        }
      }
      

      console.log(yaml.safeDump(testingOne))
*/


    try {
        //
        var yamlStr = fs.readFileSync(fileName,'utf8').toString()

        // Get document, or throw exception on error
        try {
            var doc = yaml.safeLoad(yamlStr);
            // console.log(doc);  // test only

            if ( doc !== undefined ) {
              var fpos = 2;
              var exprMap = {}
              for ( var i = fpos + 1; i < process.argv.length; i += 2 ) {
                  exprMap[process.argv[i]] = process.argv[i+1]
              }
  
              for ( var expr in exprMap ) {
                  var val = exprMap[expr]
                  if ( isNaN(val) && !isBoolean(val) ) {
                      var execr = `doc.${expr} = '${val}'`
                      eval(execr)    
                  } else {
                      var execr = `doc.${expr} = ${val}`
                      eval(execr)    
                  }
              }
  
              console.log(yaml.safeDump(doc))  
            }
            
        } catch (e) {
            console.log(e);
        }

    } catch (e) {
        console.error(e);
    }


}

