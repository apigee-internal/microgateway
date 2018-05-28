'use strict';

var forever = require('forever-monitor');
try {
    var foreverOptions = require('./forever.json');
} catch (err) {
    console.error(err);
    console.log('using default forever options');
    var foreverOptions = {
        max: 3,
        silent: false,
        killTree: true,
        minUptime: 2000
    };
}

var child = new(forever.Monitor)('./app.js', foreverOptions);

child.start();