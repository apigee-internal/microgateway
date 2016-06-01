'use strict'
const fs = require('fs')
const configLocations = require('../../config/locations');

module.exports =  function init(cb) {
  const initConfigPath = configLocations.getInitPath();
  const defaultConfigPath = configLocations.getDefaultPath();
  if (fs.existsSync(defaultConfigPath)) {
    fs.unlinkSync(defaultConfigPath);
  }
  copyFile(initConfigPath,defaultConfigPath,(err)=>{
    err && console.log("failed to init configpath file %s",err)
    cb(err,defaultConfigPath);
  })
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
  wr.on("close", function(ex) {
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

