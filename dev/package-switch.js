

fs = require('fs')

if ( fs.existsSync("./dev/package-pure.json") ) {
    fs.copyFileSync("./package.json","./dev/package-dev.json")
    fs.renameSync("./dev/package-pure.json","./package.json")
} else {
    fs.copyFileSync("./package.json","./dev/package-pure.json")
    fs.renameSync("./dev/package-dev.json","./package.json")
}

