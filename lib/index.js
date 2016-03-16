'use strict';
const path = require('path')
const configPath = path.join(__dirname, 'config', 'config.yaml')
const app = require('./agent')(configPath);
app.start(function (err) {
  if (err) {
    console.error('edgemicro failed to start agent', err);
    process.exit(1);
  }
});
module.exports = app;