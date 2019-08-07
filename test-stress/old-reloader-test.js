// gateway.test.js

'use strict';

const assert = require('assert');
const rewire = require('rewire')

const reloadCluster = require('./reload-cluster-old.js');

const path = require('path');


class FauxLogger {
	constructor() {
	}
	writeLogRecord(message) {

	}
	info(message) {
		
	}
	warn(obj, msg) {
		console.log(obj)  // this is how it is for
    }
}


function runWithRandomFailures() {
	// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
	var mgCluster = reloadCluster( __dirname + "/random_fails.js", { logger: new FauxLogger() })
	mgCluster.run()
	setInterval(() => {
		console.log(" TRACKED: " + mgCluster.countTracked() + " LEAVING: " + mgCluster.countClosing() + " CLUSTER: " + mgCluster.countCluster())
	},500)
}


runWithRandomFailures()
