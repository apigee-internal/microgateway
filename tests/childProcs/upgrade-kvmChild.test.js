'use strict';

const upgradeKVM = require('../../cli/lib/upgrade-kvm.js')();
const envVars = require('../env.js');
const {user:username, password, env, org, tokenId, tokenSecret } = envVars;


upgradeKVM.upgradekvm({username, password, env, org});