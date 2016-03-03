'use strict';
const app = require('./agent');
app.init(function (err) {
    if (err) {
        console.error('edgemicro failed to start agent', err);
        process.exit(1);
    }
});
module.exports = app;