const { spawnSync } = require('child_process');
const path = require('path');
const assert = require('assert');
const { org, env, user, password, key, secret, otoken } = require('./env.js');

const cliPath = path.join(__dirname, '..', 'cli', 'edgemicro-cert');
describe('OAuth token option for management API calls', done => {
  it('edgemicro-cert check -t', done => {
    let bash = spawnSync(cliPath, ['check', '-e', env, '-o', org, '-t', otoken]);
    let outString = Buffer.from(bash.stdout).toString();
    assert.equal(outString.includes('checked cert successfully'), true);
    done();
  });

  it('edgemicro-cert delete -t', done => {
    let bash = spawnSync(cliPath, ['delete', '-e', env, '-o', org, '-t', otoken]);
    let outString = Buffer.from(bash.stdout).toString();
    assert.equal(outString.includes('KVM deleted'), true);
    done();
  });

  it('edgemicro-cert install -t', done => {
    let bash = spawnSync(cliPath, ['install', '-e', env, '-o', org, '-t', otoken]);
    let outString = Buffer.from(bash.stdout).toString();
    assert.equal(outString.includes('installed cert'), true);
    done();
  });

  it('recheck edgemicro-cert check -t', done => {
    let bash = spawnSync(cliPath, ['check', '-e', env, '-o', org, '-t', otoken]);
    let outString = Buffer.from(bash.stdout).toString();
    console.log('outString', outString);
    assert.equal(outString.includes('checked cert successfully'), true);
    done();
  });
});
