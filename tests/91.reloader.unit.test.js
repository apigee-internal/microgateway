// gateway.test.js

'use strict';

const assert = require('assert');
const rewire = require('rewire')

const reloadCluster = rewire('../cli/lib/reload-cluster.js');
const itemManagers = require('../cli/lib/util/item-managers.js')

const path = require('path');



const denv = require('dotenv');
denv.config();
const envVars = require('./env.js');
const {user:username, password, env, org, tokenId:id, tokenSecret, key, secret } = envVars;
const { spawn, spawnSync, execSync } = require("child_process");

describe('reaload-cluster module', () => {

	// -------- -------- -------- -------- -------- -------- -------- -------- --------
	it('test initilization',  (done) => {
		var mgCluster = reloadCluster(__dirname + '/easystart.js',{ "workers" : 1 })
		mgCluster.terminate(() => {
			assert(true)
			done()	
		})
	});

	// -------- -------- -------- -------- -------- -------- -------- -------- --------
	it('test timer list',  (done) => {
		//
		var TimerList = reloadCluster.__get__('TimerList')
		var tlist = new TimerList()
		var to = tlist.addTimeout(() => { assert(false); done() },10000)
		tlist.remove(to)
		assert(tlist.items.length === 0)
		//
		to = tlist.addTimeout(() => { assert(false); done() },10000)
		to = tlist.replaceTimeout(to,() => {
			assert(true);
			tlist.addTimeout(() => { assert(false); done() },10000)
			tlist.addTimeout(() => { assert(false); done() },10000)
			tlist.addTimeout(() => { assert(false); done() },10000)
			tlist.addTimeout(() => { assert(false); done() },10000)
			tlist.addTimeout(() => { assert(false); done() },10000)
			tlist.clear()
			//
			assert(tlist.items.length === 0)
			done()
		},30)
		//
	});

	// -------- -------- -------- -------- -------- -------- -------- -------- --------
	it('test Callback list',  (done) => {
		//
		var CallbackList = reloadCluster.__get__('CallbackList')
		//
		var cbl = new CallbackList()
		assert(cbl.items.length === 0)
		var nn = 0;
		var a = () => { console.log("this is a test"); }
		var b = () => { nn += 1 }
		var c = () => { nn += 2 }
		var d = () => { nn += 3 }
		cbl.add(a)
		cbl.add(b)
		cbl.add(c)
		cbl.add(d)
		assert(cbl.items.length === 4)
		cbl.remove(a)
		assert(cbl.items.length === 3)
		cbl.runCallBacks()
		assert(nn === 6)
		//
		done()
	});


	it('test exit counter', (done) => {
		var exitCounter = new itemManagers.ExitCounter(3,(b) => {
			// test progress
		})
		exitCounter.stop();
		exitCounter.incr()
		exitCounter.incr()
		exitCounter.incr()
		var state = exitCounter.calcExitRate()
		var rate = exitCounter.averageRate()
		assert(rate === 3)
		assert(exitCounter.periods.length === 1)
		assert(state)
		exitCounter.incr()
		exitCounter.incr()
		exitCounter.incr()
		exitCounter.incr()
		state = exitCounter.calcExitRate()
		rate = exitCounter.averageRate()
		assert(rate === 3.5)
		assert(exitCounter.periods.length === 2)
		assert(!state)

		done()
	});

	// -------- -------- -------- -------- -------- -------- -------- -------- --------
	it('test workerConnect',  (done) => {
		//
		var WorkerInfo = reloadCluster.__get__('WorkerInfo')
		var tTracked = reloadCluster.__get__('tTracked')
		//
		var fauxWorker = { 
			'id' : "testid",
			'isConnected' : () => { return(true) }, 
			'isDead' : () => { return(false) } }

		var mgCluster = reloadCluster(__dirname + '/easystart.js',{ "workers" : 1 })

		var revert = reloadCluster.__set__('cluster',{
			"workers" : { 
				'testid': {
					'id' : "123",
					'isConnected' : () => { return(true) },
					'isDead' : () => { return(false) }
			}}})

		var w_info = tTracked[fauxWorker.id] = new WorkerInfo(fauxWorker)
		//
		assert(w_info.request_disconnect === false)
		assert(w_info.request_shutdown === false)
		assert(w_info.connectedEvent === true)
		assert(w_info.request_shutdown === false)
		// console.log(w_info.trackingStartTime)
		//
		assert(w_info.trackingStartTime <= Date.now())
		assert(w_info.worker_key === fauxWorker.id )
		//
		w_info.connectedEvent = false
		var addr = 'this is an address'
		mgCluster.workerConnect(fauxWorker,addr)
		//
		assert(w_info.address === addr)
		//
		revert()
		mgCluster.terminate(() => {
			assert(true)
			done()	
		})
		//
	});

	// -------- -------- -------- -------- -------- -------- -------- -------- --------
	it('test untrackTrackedProcesses',  (done) => {
		//
		var untrackTrackedProcesses = reloadCluster.__get__('untrackTrackedProcesses')
		//
		reloadCluster.__set__('tTracked',{})
		var tTracked = reloadCluster.__get__('tTracked')
		reloadCluster.__set__('tClosers',{})
		var tClosers = reloadCluster.__get__('tClosers')
		//
		tTracked['a'] = 1
		tTracked['b'] = 2
		tTracked['c'] = 3
		untrackTrackedProcesses()
		console.log(tTracked)
		console.log(tClosers)
		assert(Object.keys(tTracked).length === 0)
		assert(Object.keys(tClosers).length === 3)
		assert(tClosers['b'] === 2)
		reloadCluster.__set__('tClosers',{})
		//
		done()
	});

	// -------- -------- -------- -------- -------- -------- -------- -------- --------
	it('test connectTimeout WorkerInfo',  (done) => {
		//
		var WorkerInfo = reloadCluster.__get__('WorkerInfo')
		//
		var fauxWorker = { 
			'id' : "testid",
			'isConnected' : () => { return(false) }, 
			'isDead' : () => { return(false) } }

		var revert = reloadCluster.__set__('cluster',{
			"workers" : { 
				"testid" : {
					"id" : "123",
					'isConnected' : () => { return(false) }, 
					'isDead' : () => { return(false) }
				}
			}})
		//
		var w_info = new WorkerInfo(fauxWorker)
		w_info.trackingStartTime = 0
		//
		var b = w_info.connectTimeout()
		assert(b)
		//
		revert()
		done()
	});

// -------- -------- -------- -------- -------- -------- -------- -------- --------
it('test shouldTrackWorker',  (done) => {
	//
	var shouldTrackWorker = reloadCluster.__get__('shouldTrackWorker')
	var WorkerInfo = reloadCluster.__get__('WorkerInfo')

	//
	reloadCluster.__set__('tTracked',{})
	reloadCluster.__set__('tClosers',{})
	//
	var fauxWorker = { 
		'id' : "testid",
		'isConnected' : () => { return(false) }, 
		'isDead' : () => { return(false) } 
	}
	var w_info = new WorkerInfo(fauxWorker)

	var b = shouldTrackWorker(fauxWorker,true)
	assert(!b)
	b = shouldTrackWorker(fauxWorker,false)
	assert(b)

	reloadCluster.__set__('tTracked',{ 'testid' : w_info })
	b = shouldTrackWorker(fauxWorker,false)
	assert(!b)
	b = shouldTrackWorker(fauxWorker,true)
	assert(!b)

	w_info.connectedEvent = true
	b = shouldTrackWorker(fauxWorker,false)
	assert(!b)
	b = shouldTrackWorker(fauxWorker,true)
	assert(!b)

	fauxWorker = { 
		'id' : "testid",
		'isConnected' : () => { return(false) }, 
		'isDead' : () => { return(true) } 
	}
	b = shouldTrackWorker(fauxWorker,false)
	assert(!b)
	b = shouldTrackWorker(fauxWorker,true)
	assert(!b)


	fauxWorker = { 
		'id' : "testid",
		'isConnected' : () => { return(true) }, 
		'isDead' : () => { return(false) } 
	}
	b = shouldTrackWorker(fauxWorker,false)
	assert(!b)
	b = shouldTrackWorker(fauxWorker,true)
	assert(!b)

	reloadCluster.__set__('tTracked',{})
	reloadCluster.__set__('tClosers',{ 'testid' : w_info })
	b = shouldTrackWorker(fauxWorker,false)
	assert(!b)
	b = shouldTrackWorker(fauxWorker,true)
	assert(!b)
	//
	reloadCluster.__set__('tClosers',{})
	reloadCluster.__set__('tTracked',{})
	fauxWorker = { 
		'id' : "testid",
		'isConnected' : () => { return(true) }, 
		'isDead' : () => { return(false) } 
	}
	b = shouldTrackWorker(fauxWorker,false)
	assert(b)
	b = shouldTrackWorker(fauxWorker,true)
	assert(!b)

	fauxWorker = { 
		'id' : "testid",
		'isConnected' : () => { return(false) }, 
		'isDead' : () => { return(true) } 
	}
	b = shouldTrackWorker(fauxWorker,false)
	assert(!b)
	b = shouldTrackWorker(fauxWorker,true)
	assert(!b)

	reloadCluster.__set__('tClosers',{})
	reloadCluster.__set__('tTracked',{})
	//
	done()
});






});
