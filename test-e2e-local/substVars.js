

const fs = require('fs')

var nargs = process.argv.length - 1
var fpos = 2




function subst(tmplt,tvar,value) {
    var output = ""
    do {
        output = tmplt;
        tmplt = output.replace(tvar,value)
    } while ( tmplt !== output );
    return(output)
}



if ( nargs > 2 && ( (nargs % 2) === 0 ) ) {
    //
    var fileName = process.argv[fpos]
    var substpairs = []
    for ( var i = (fpos + 1); i < (nargs+1); i++ ) {
        substpairs.push(process.argv[i])
    }
    //
    if ( substpairs.length ) {

        var templtStr = fs.readFileSync(fileName,'ascii').toString()

        var substMap = {}

        while ( substpairs.length ) {
            var key = substpairs.shift();
            var value = substpairs.shift();
            substMap[key] = value;
        }
    
        for ( var ky in substMap ) {
            var val = substMap[ky]
            templtStr = subst(templtStr,('$' + ky),val)
        }

        console.log(templtStr);
    }

}