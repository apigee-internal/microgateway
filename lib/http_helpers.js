'use strict';
const statusCodes = require('http').STATUS_CODES;
const d = require('debug')('agent');
const sym = require('log-symbols');


const http_helpers = exports.http_helpers = {};

http_helpers.status = function status(code, res) {
  const outgoingMessage = res; // cast to node.http.OutgoingMessage to gain access to 'finished'
  if (!outgoingMessage.finished) {
    res.setHeader('content-type', 'application/json');
  }
  res.statusCode = code;
  d(sym.info, code);
  return res;
}
http_helpers.error = function error(code, res, err) {
  const message = JSON.stringify(err ? err.message : statusCodes[code]);
  const outgoingMessage = res; // cast to node.http.OutgoingMessage to gain access to 'finished'
  if (!outgoingMessage.finished) {
    res.setHeader('content-type', 'application/json');
    res.statusCode = code;
    res.write(message);
  }
  if (code >= 400) {
    res.end();
  }
  d(sym.error, code, message);
}
