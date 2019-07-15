//
const fs = require('fs')

//| jq -r .credentials[0].consumerKey

var nargs = process.argv.length;

if ( nargs > 2 ) {

    var fpos = 2
    //
    var fileName = process.argv[fpos]

    try {
        var jsnStr = fs.readFileSync(fileName,'ascii').toString()
        var jsn = JSON.parse(jsnStr)
    
        var consumerKey = jsn.credentials[0].consumerKey
    
        console.log(consumerKey);    
    } catch (e) {
        console.error(e);
    }
}

