// gateway.test.js

'use strict';

const assert = require('assert');
const rewire = require('rewire')

const reloadCluster = require('../cli/lib/reload-cluster.js');

const path = require('path');
const { spawn } = require('child_process')

function whatProcesses(cb) {
	//
	const ls = spawn('ps', ['-a']);

	var lines = ""
	ls.stdout.on('data', (data) => {
		lines += data.toString();
	  //console.log(`stdout: ${data}`);
	});
	
	ls.stderr.on('data', (data) => {
	  //console.log(`stderr: ${data}`);
	});
	
	ls.on('close', (code) => {
		//console.log(lines)
	
		lines = lines.split('\n');
		var findLines = lines.filter(line => {
			if ( line.indexOf('random_fails.js') > 0 ) {
				return(true)
			}
			return(false)
		})
	
		//console.log(findLines)
	
		var pids = findLines.map(line => {
			var ll = line.trim().split(' ')
			return(ll[0])
		})
	
		console.log("PROCESSES: " + pids.length + " == " + pids.join(', '))
		//killOff(numpids,pids)

		cb()
	
	});
	
}


function reloadRandom(cl) {
    var rT = Math.trunc(Math.round(Math.random()*10000))
	rT = parseInt('' + rT)

	whatProcesses(
		() => {
			setTimeout(() => {
				cl.reload((message) =>{
					if ( message ) {
						console.log("RELOAD MESSAGE: " + message)
					}
					console.log("RELOADED: " + rT + " TRACKED: " + cl.countTracked() + " LEAVING: " + cl.countClosing() + " CLUSTER: " + cl.countCluster())
					setImmediate(() => { reloadRandom(cl) }) 
				})
			})		
		}
	)
	
}

function runWithRandomFailures() {
	// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----
	var mgCluster = reloadCluster(__dirname + "/random_fails.js",{})
	mgCluster.run()

	reloadRandom(mgCluster)
}


runWithRandomFailures()
