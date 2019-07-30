'use strict'
const fs = require('fs')
const path = require('path');
const configLocations = require('../../config/locations');

module.exports =  function init(opts, cb) {
  if(typeof opts === 'function') {
    cb = opts;
  }
  
  const setupConfigPath = (srcFile, destFile, destFileDir, cb) => {
  
    if(fs.existsSync(destFile)) {
      fs.unlinkSync(destFile);
    }

    fs.mkdir(destFileDir, () => {
      copyFile(srcFile, destFile, (err) => {
        if ( err )  console.log("failed to init configpath file %s", err);
        cb(err, destFile);
      }); 
    });
  }

  if(!opts.configDir) {
    const initConfigPath = configLocations.getInitPath();
    const defaultConfigPath = configLocations.getDefaultPath();

    setupConfigPath(initConfigPath, defaultConfigPath, configLocations.homeDir, cb);
  } else {
    const initConfigPath = configLocations.getInitPath();
    const customConfigPath = path.join(opts.configDir, configLocations.defaultFile);

    setupConfigPath(initConfigPath, customConfigPath, opts.configDir, cb);
  }
}
function copyFile(source, target, cb) {
  var cbCalled = false;

  var rd = fs.createReadStream(source);
  rd.on("error", function(err) {
    done(err);
  });
  var wr = fs.createWriteStream(target);
  wr.on("error", function(err) {
    done(err);
  });
  wr.on("close", function( /* ex */) {
    done();
  });
  rd.pipe(wr);

  function done(err) {
    if (!cbCalled) {
      cb(err);
      cbCalled = true;
    }
  }
}

