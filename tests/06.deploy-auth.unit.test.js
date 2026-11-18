'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sinon = require('sinon');
const apigeeUtils = require('volos-util-apigee');
const deployAuthLib = require('../cli/lib/deploy-auth');

const HOME_KEY = process.platform === 'win32' ? 'USERPROFILE' : 'HOME';

describe('deploy-auth deployWithLeanPayload', function () {
  this.timeout(15000);

  const origHome = process.env[HOME_KEY];
  let root;

  afterEach(() => {
    sinon.restore();
    if (origHome === undefined) {
      delete process.env[HOME_KEY];
    } else {
      process.env[HOME_KEY] = origHome;
    }
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('stages under $HOME/.edgemicro outside os.tmpdir(), deploys, and cleans up', (done) => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'emg-deploy-auth-')));
    const fakeHome = path.join(root, 'home');
    const fakeTmp = path.join(root, 'tmp');
    const edgemicroDir = path.join(fakeHome, '.edgemicro');
    fs.mkdirSync(edgemicroDir, { recursive: true });
    fs.mkdirSync(fakeTmp);
    process.env[HOME_KEY] = fakeHome;
    sinon.stub(os, 'tmpdir').returns(fakeTmp); // $HOME must sit outside os.tmpdir()

    let stagingDir;
    sinon.stub(apigeeUtils, 'deployProxy').callsFake((opts, cb) => {
      stagingDir = opts.directory;
      cb(null);
    });

    deployAuthLib({
      managementUri: 'https://api.enterprise.apigee.com',
      authUri: 'https://%s-%s.apigee.net/edgemicro-auth'
    }).deployWithLeanPayload({
      org: 'testorg',
      env: 'testenv',
      proxyName: 'edgemicro-auth',
      username: 'user@example.com',
      password: 'secret'
    }, (err, publicKeyUri) => {
      try {
        assert.ifError(err);
        assert.strictEqual(publicKeyUri, 'https://testorg-testenv.apigee.net/edgemicro-auth/publicKey');
        assert.strictEqual(path.dirname(stagingDir), edgemicroDir);
        assert.deepStrictEqual(fs.readdirSync(edgemicroDir), []);
        done();
      } catch (e) {
        done(e);
      }
    });
  });
});
