// gateway.test.js

'use strict';

const assert = require('assert');
const rewire = require('rewire')

const reloadCluster = require('../cli/lib/reload-cluster.js');

const path = require('path');

function runWithRandomFailures() {
	// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
	var mgCluster = reloadCluster(__dirname + "/random_fails.js",{})
	mgCluster.run()
	setInterval(() => {
		console.log(" TRACKED: " + mgCluster.countTracked() + " LEAVING: " + mgCluster.countClosing() + " CLUSTER: " + mgCluster.countCluster())
	},500)
}


runWithRandomFailures()
