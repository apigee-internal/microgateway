#!/usr/bin/env node

/// <reference path="../typings/node/node.d.ts"/>

'use strict';

const async = require('async');
const exec = require('child_process').exec;
const spawn = require('child_process').spawn;
const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const parseArgs = require('minimist');
const yaml = require('js-yaml');

const argv = parseArgs(process.argv.slice(2));
if (!argv.version) {
  console.error('Usage:', process.argv[1], '--version <major.minor.patch>');
  process.exit(1);
}

const buildDir = path.join(os.tmpdir(), 'edgemicro-build');
if (fs.existsSync(buildDir)) {
  fs.emptyDirSync(buildDir);
} else {
  fs.mkdirSync(buildDir);
}

async.parallel([
  function(cb) { available('gulp', cb); },
  function(cb) { available('tsc', cb); }
], function(err /*, results*/ ) {
  if (err) {
    console.error('gulp/tsc not found in path (try "npm i -g gulp typescript")');
    process.exit(1);
  }
});

process.chdir(buildDir);
console.info('building package in', buildDir);

const topLevelFiles = [
  'build.yaml',
  'README',
  'LICENSE'
]

const excludes = [
  // dirs
  '.git*',
  'typings/*',
  '*test*',
  // files
  '**/README.md',
  // cli
  'cli/config/default-*.yaml',
  // plugins
  'plugins/bin/*',
  'plugins/config/*',
  'plugins/test-*/*',
  // agent
  'agent/src/*',
  'agent/bin/*',
  'agent/tsconfig.json',
  'agent/gulpfile.js',
  'agent/config/default-*.yaml'
];

const rootDir = path.join(buildDir, 'microgateway');

const tasks = [];
tasks.push(function(cb) { git_clone('git@revision.aeip.apigee.net:edgemicro/microgateway.git', 'master',  cb); });
tasks.push(function(cb) { process.chdir(rootDir); cb(); });
tasks.push(function(cb) { build_properties(rootDir, cb); });
tasks.push(function(cb) { git_tag(rootDir, cb); });

const dirs = ['gateway', 'agent', 'cli', 'plugins'];
dirs.forEach(function(dir) {
  tasks.push(function(cb) { update_version(dir, cb); });
  tasks.push(function(cb) { npm_install(dir, true, cb); });
  if (dir === 'agent') {
    tasks.push(function(cb) { npm_install(dir, false, cb); }); // need dev dependecies for gulp, tsc
    tasks.push(function(cb) { gulp(dir, 'build', cb); });
  }
});

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/toISOString
function pad(number) {
  if (number < 10) {
    return '0' + number;
  }
  return String(number);
}

const now = new Date();
const timestamp = pad(now.getFullYear()) + pad(now.getMonth()+1) + pad(now.getDate());
const zipfile = 'apigee-edge-microgateway-' + argv.version + '-' + timestamp + '.zip';

tasks.push(function(cb) {
  zip(zipfile, rootDir, topLevelFiles.concat(dirs), excludes, cb);
});

async.series(tasks, function(err  /*, results */) {
  if (err) throw err;
});

function git_clone(repo, branch, callback) {
  console.log('git clone', repo);
  exec(
    'git clone ' + (branch ? '-b ' + branch + ' ': '') + '-q ' + repo,
    function(error, stdout, stderr) {
      // console.info(stdout);
      console.error(stderr);
      if (error) {
        console.error('error cloning repo', repo, error);
        callback(error);
      } else {
        console.info('cloned', repo);
        callback();
      }
    }
  );
}

function npm_install(dir, production, callback) {
  console.log('npm install', dir, production ? '(production)' : '(development)');
  exec(
    'npm install ' + (production ? '--production' : ''),
    {cwd: dir},
    function(error, stdout, stderr) {
      // console.info(stdout);
      console.error(stderr);
      if (error) {
        console.error('error running npm install in dir', dir, error);
        callback(error);
      } else {
        console.info('installed modules in', dir);
        callback();
      }
    }
  );
}

function build_properties(repo, callback) {
  console.log('creating build properties in', repo);
  const properties = {};
  properties.version = argv.version;
  properties.date = (new Date()).toISOString();
  exec(
    'git show HEAD|grep commit|cut -f2 -d" "',
    {cwd: repo},
    function(error, stdout, stderr) {
      console.error(stderr);
      if (error) {
        console.error('error running "git show HEAD" in repo', repo, error);
        callback(error);
      } else {
        properties.head = stdout.trim();
        const props = yaml.safeDump(properties, {skipInvalid: true});
        fs.writeFileSync(path.join(repo, "build.yaml"), props);
        callback();
      }
    }
  );
}

function update_version(repo, callback) {
  const pkgJSON = path.join(repo, 'package.json');
  console.log('updating version in', pkgJSON);
  const pkg = JSON.parse(fs.readFileSync(pkgJSON));
  pkg.version = argv.version;
  fs.writeFileSync(pkgJSON, JSON.stringify(pkg, null, 2));
  callback();
}

function git_tag(repo, callback) {
  const tag = 'v' + argv.version;
  console.log('tagging repo', repo, 'with version', tag);
  exec(
    'git tag ' + tag,
    {cwd: repo},
    function(error, stdout, stderr) {
      console.error(stderr);
      if (error) {
        console.error('error running "git tag" in repo', repo, error);
        callback(error);
      } else {
        callback();
      }
    }
  );
}

function gulp(dir, target, callback) {
  console.log('gulp', target);
  exec(
    'gulp ' + target,
    {cwd: dir},
    function(error, stdout, stderr) {
      // console.info(stdout);
      console.error(stderr);
      if (error) {
        console.error('error running gulp in dir', dir, error);
        callback(error);
      } else {
        console.info('compiled sources in', dir);
        callback();
      }
    }
  );
}

function zip(zipfile, dir, dirs, excludes, callback) {
  const command = '/usr/bin/zip';
  const args = ['-q', '--symlinks', '-r', zipfile].concat(dirs, '-x', excludes);
  console.log(dir, command, args.join(' '));
  const zip = spawn(command, args, {
    cwd: dir,
    stdio: 'inherit'
  });

  zip.on('exit', function(error) {
    if (error) {
      console.error('error creating zip', error);
      callback(error);
    } else {
      console.info('built', path.join(dir, zipfile));
      callback();
    }
  });
}

function available(cmd, callback) {
  exec('/usr/bin/which ' + cmd,
    function(error, stdout /*, stderr */) {
      // console.info(error, stdout);
      callback(error, stdout);
    }
  );
}

