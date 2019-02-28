// gateway.test.js

'use strict';

const path = require('path');
const assert = require('assert');
const envVars = require('./envVars.js');
const gateway = require(path.join(__dirname, '..', 'cli', 'lib', 'gateway.js'))();
const {
    user: username,
    password,
    env,
    org,
    tokenId: id,
    tokenSecret,
    key,
    secret
} = envVars;
const { spawn, spawnSync, execSync } = require('child_process');

describe('gateway module', () => {
    let gatewayStart;
    before(done => {
        gatewayStart = spawn('node', ['tests/childProcs/gatewayStart.test.js']);
        done();
    });

    it('starts mgw', done => {

        let outDataStr;
        gatewayStart.stdout.on('data', data => {
            outDataStr += Buffer.from(data).toString();
            console.log('outDataStr', outDataStr);
            if (outDataStr.includes('PROCESS PID :')) {
                outDataStr = '';
                done();
            }
        });

        let errDataStr;
        gatewayStart.stderr.on('data', errData => {
            errDataStr += Buffer.from(errData).toString();
            console.log('gatewayStart errData', errDataStr);
        });
    });

    it('provides mgw status when running', done => {
        let gatewayStatus = spawn('node', [
            'tests/childProcs/gatewayStatus.test.js'
        ]);
        let outDataStr;
        gatewayStatus.stdout.on('data', data => {
            outDataStr += Buffer.from(data).toString();
            if (outDataStr.includes('edgemicro is running with')) {
                gatewayStatus.kill();
                done();
            }
        });

        let errDataStr;
        gatewayStatus.stderr.on('data', errData => {
            errDataStr += Buffer.from(errData).toString();
            console.error('errData from gatewayStatus', errDataStr);
        });
    });

    it('reloads mgw when running', done => {
        let gatewayReload = spawn('node', [
            'tests/childProcs/gatewayReload.test.js'
        ]);

        let outDataStr;
        gatewayReload.stdout.on('data', data => {
            outDataStr += Buffer.from(data).toString();
            console.log('data', outDataStr);
            if (outDataStr.includes('reloaded')) gatewayReload.kill();
            if (outDataStr.includes('Reload Completed Successfully')) {
                gatewayReload.stdin.write('reloaded');
                outDataStr = '';
                done();
            }
        });

        let errDataStr;
        gatewayReload.stderr.on('data', errData => {
            errDataStr += Buffer.from(errData).toString();
            console.error('errDataStr', errDataStr);
            if (errDataStr.includes('Reloading edgemicro was unsuccessful')) {
                assert.equal(false, 'Reloading edgemicro was unsuccessful');
                gatewayReload.kill();
                done();
            }
        });
    });

    it('stops mgw when running', done => {
        let gatewayStop = spawn('node', ['tests/childProcs/gatewayStop.test.js']);
        let outDataStr;
        gatewayStop.stdout.on('data', data => {
            outDataStr += Buffer.from(data).toString();
            console.log('outData-Stop', outDataStr);
            if (outDataStr.includes('Stop Completed Succesfully')) {
                gatewayStop.kill();
                done();
            }
        });

        let errDataStr;
        gatewayStop.stderr.on('data', errData => {
            errDataStr += Buffer.from(errData).toString();
            console.log('errDataStr', errDataStr);
            if (errDataStr.includes('Stopping edgemicro was unsuccessful')) {
                assert.equal(false, 'Stopping edgemicro was unsuccessful');
                gatewayStop.kill();
                done();
            }
        });
    });

    it('provides mgw status when not running', done => {

        let gatewayStatus = spawnSync('node', [
            'tests/childProcs/gatewayStatus.test.js'
        ]);

        let errString = Buffer.from(gatewayStatus.stderr).toString();
        let outDataStr = Buffer.from(gatewayStatus.stdout).toString();
        console.log('errString-gatewayStatus Closed', errString);
        if (errString.includes('edgemicro is not running')) done();
        if (outDataStr.includes('edgemicro is running with')) {
            assert(false);
            done();
        }
    });

    it('returns "edgemicro is not running" when reloading non-running mgw', done => {
        let gatewayReload = spawnSync('node', [
            'tests/childProcs/gatewayReload.test.js'
        ]);
        let outDataStr = Buffer.from(gatewayReload.stdout).toString();
        let errString = Buffer.from(gatewayReload.stderr).toString();
        if (errString.includes('edgemicro is not running')) done();
        if (outDataStr.includes('Reload Completed Successfully')) {
            assert(false);
            done();
        }
    });

    it('returns "edgemicro is not running" when stopping a non-running mgw', done => {
        let gatewayStop = spawnSync('node', [
            'tests/childProcs/gatewayStop.test.js'
        ]);
        let errString = Buffer.from(gatewayStop.stderr).toString();
        let outDataStr = Buffer.from(gatewayStop.stdout).toString();
        console.log('errString-gatewayStop Closed', errString);
        if (errString.includes('edgemicro is not running')) done();
        if (outDataStr.includes('Stop Completed Succesfully')) {
            assert(false);
            done();
        }
    });
});