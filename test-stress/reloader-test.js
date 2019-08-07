// gateway.test.js

'use strict';

const assert = require('assert');
const rewire = require('rewire')

const reloadCluster = require('../cli/lib/reload-cluster.js');

const path = require('path');


var mockLogger = {
    info: function (obj, msg) {
    },
    warn: function (obj, msg) {
		console.log(obj)  // this is how it is for
    },
    error: function (obj, msg) {
    },
    eventLog: function (obj, msg) {
    },
    consoleLog: function (level, ...data) {
    },
    stats: function (statsInfo, msg) {
    },
    setLevel: function (level) {
    },
    writeLogRecord: function(record,cb) {              
    }
  };


function runWithRandomFailures() {
	// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
	var mgCluster = reloadCluster(__dirname + "/random_fails.js",{
		logger : mockLogger
	})
	mgCluster.run()
	setInterval(() => {
		console.log(" TRACKED: " + mgCluster.countTracked() + " LEAVING: " + mgCluster.countClosing() + " CLUSTER: " + mgCluster.countCluster())
	},500)
}


runWithRandomFailures()
