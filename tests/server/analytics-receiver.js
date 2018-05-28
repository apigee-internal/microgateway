// / <reference path="../../../typings/node/node.d.ts" />

'use strict';

var Buffer = require('buffer').Buffer;
var http = require('http');
var zlib = require('zlib');

var total = 0;
var server = http.createServer(function(req, res) {
    let chunks = [];
    req.on('data', function(chunk) {
        chunks.push(chunk);
        // console.log('received chunk', chunk.length, Buffer.isBuffer(chunk), require('util').inspect(chunk));
    });
    req.on('end', function() {
        let body = Buffer.concat(chunks);
        // console.log('body', require('util').inspect(body));
        // var uncompressed = zlib.gunzipSync(body);
        let payload = JSON.parse(body);
        let count = payload.records.length;
        total += count;
        let totalResponseTime = payload.records.reduce(function(previous, current, index) {
            let record = payload.records[index];
            return previous + (record.client_sent_end_timestamp - record.client_received_start_timestamp);
        }, 0);
        // console.log(req.headers);
        console.log('received', count, 'records, total', total, 'average response time', totalResponseTime / count, 'ms');
        let response = {
            accepted: count,
            rejected: 0,
        };
        res.end(JSON.stringify(response));
    });
    req.on('error', function(err) {
        console.log('err', err);
    });
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
});

var port = 7000;
server.listen(port, function(err) {
    if (err) console.error('error listening on port', port, err);
    else console.info('analytics receiver listening on', port);
});
