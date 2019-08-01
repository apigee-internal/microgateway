// gateway.test.js

'use strict';

const assert = require('assert');
const fs = require('fs')
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
	
	ls.on('close', (code) => {
		//console.log(lines)
	
		lines = lines.split('\n');
		var findLines = lines.filter(line => {
			if ( line.indexOf('gauged_fails.js') > 0 ) {
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

var tries = 0

//node tools/tester.js start -o leddyr-eval -e test -k b9e16e617ae2ca8e49eed457ea5ac283877ba3bb2ce6026309bb438bb68dfda5 -s 0f15cb04bbc0d7e520da8fc85be74af25f36d74b6c072e4b1f378580087aef64 -p 4

var cmdLine = "tools/tester.js start -o leddyr-eval -e test -k b9e16e617ae2ca8e49eed457ea5ac283877ba3bb2ce6026309bb438bb68dfda5 -s 0f15cb04bbc0d7e520da8fc85be74af25f36d74b6c072e4b1f378580087aef64 -p 4"

function killedge(mg) {
	mg.kill('SIGINT')
}


function startStop() {
	// 
	var args = cmdLine.split(' ')
	var mg = spawn('node', args)

	var line = ''
	var applines = []
	mg.stdout.on('data', (data) => {
		line += data.toString();
		var lines = line.split('\n')
		if ( lines.length > 1 ) {
			line = lines.pop() // put the last line back in just in case it is part of one
			applines = applines.concat(lines)
		}

		console.log("CONTROLLER OUT: " +  applines.length)

		if ( applines.length > 20 ) {
			setTimeout(() => {
				killedge(mg)
			},1000);
		}
	});
	
	mg.stderr.on('data', (data) => {
		line += data.toString();
		var lines = line.split('\n')
		if ( lines.length > 1 ) {
			line = lines.pop() // put the last line back in just in case it is part of one
			applines = applines.concat(lines)
		}

		console.log("CONTROLLER ERR: " +  applines.length)

		if ( applines.length > 20 ) {
			setTimeout(() => {
				killedge(mg)
			},1000);
		}
	});
	
	mg.on('close', (code) => {
		console.log(code)
		fs.unlink('edgemicro.sock',(err) => {
			if (err) console.log(err)
			applines = []
			setTimeout(startStop,2000)	
		})
	});

}



startStop()