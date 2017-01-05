'use strict'
const fs = require('fs')
const path = require('path');
const configLocations = require('../../config/locations');

module.exports =  function init(opts, cb) {
  if(typeof opts == 'function') {
    cb = opts;
  }

  if(!opts.configDir) {
    const initConfigPath = configLocations.getInitPath();
    const defaultConfigPath = configLocations.getDefaultPath();
    if (fs.existsSync(defaultConfigPath)) {
      fs.unlinkSync(defaultConfigPath);
    }
    fs.mkdir(configLocations.homeDir,function(){
      copyFile(initConfigPath,defaultConfigPath,(err)=>{
        err && console.log("failed to init configpath file %s",err)
        cb(err,defaultConfigPath);
      })
    });
  } else {
    const initConfigPath = configLocations.getInitPath();
    const customConfigPath = path.join(opts.configDir, configLocations.defaultFile);
    if(fs.existsSync(customConfigPath)) {
      fs.unlinkSync(customConfigPath);
    }

    fs.mkdir(opts.configDir, () => {
      copyFile(initConfigPath, customConfigPath, (err) => {
        err && console.log("failed to init configpath file %s", err);
        cb(err, customConfigPath);
      }); 
    });
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

