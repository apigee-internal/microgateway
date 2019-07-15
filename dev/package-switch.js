
const fs = require('fs')

var branchName = (process.argv.length > 2) ? process.argv[2] : '';
if (  branchName.length ) branchName = '#' + branchName;

function subst(tmplt,tvar,value) {
    var output = ""
    do {
        output = tmplt;
        tmplt = output.replace(tvar,value)
    } while ( tmplt !== output );
    return(output)
}

if ( fs.existsSync("./dev/package-pure.json") ) {
    fs.copyFileSync("./package.json","./dev/package-dev.json")
    fs.renameSync("./dev/package-pure.json","./package.json")
} else {
    var fileStr = fs.readFileSync("./dev/package-dev-template.json").toString()
    outFileStr = subst(fileStr,"$branch",branchName)
    fs.writeFileSync("./dev/package-dev.json",outFileStr)
    fs.copyFileSync("./package.json","./dev/package-pure.json")
    fs.renameSync("./dev/package-dev.json","./package.json")
}
