'use strict';

var run = require('./cli/lib/gateway')();
const os = require('os');

const options = {};

options.env = process.env.EDGEMICRO_ENV;
options.key = process.env.EDGEMICRO_KEY;
options.secret = process.env.EDGEMICRO_SECRET;
options.org = process.env.EDGEMICRO_ORG;
options.configDir = process.env.EDGEMICRO_CONFIG_DIR;
options.processes = process.env.EDGEMICRO_PROCESSES || os.cpus().length;
options.port = process.env.PORT || 8000;

run.stop(options);
