'use strict';

const path = require('path');
const minimatch = require('minimatch');
//const util = require('util');

const encoded_dot_regex = /%2e/gi;
const dot_segment_regex = /(?:^|\/)(?:\.|%2e){2}(?:\/|$)/i;

const normalizePath = (pathname) => {
  if (typeof pathname === 'string' && dot_segment_regex.test(pathname)) {
    return path.posix.normalize(pathname.replace(encoded_dot_regex, '.'));
  }
  return pathname;
};

const matchPath = (requestPath, proxyPath) => {
  requestPath = normalizePath(requestPath);
  if ( requestPath.charAt(requestPath.length-1) !== '/') {
    requestPath += '/';
  }
  if ( proxyPath.charAt(proxyPath.length-1) !== '/') {
    proxyPath += '/';
  }
  var pathRegex = generateMatchingRegex(proxyPath);
  return (pathRegex.test(requestPath));
}


const getProxyFromBasePath = (proxies, pathname) => {
  var longest = 0;
  var match;

  proxies.forEach((p) => {
    if(matchPath(pathname, p.base_path)) {
      if(p.base_path.length > longest) {
        match = p;
        longest = p.base_path.length; 
      }
    }
  });

  return match;
}
const generatedRegexCache = {};

const generateMatchingRegex = (proxyPath) => {
  if(generatedRegexCache[proxyPath]) {
    return generatedRegexCache[proxyPath];
  }
  const matchRegex = minimatch.makeRe(proxyPath);
  //minimatch creates a regex that will hard match the path. 
  //we remove the end of input so it can match proxy path and extras
  const cleansedRegex = matchRegex.toString().replace('$', '').slice(1, -1);
  return (generatedRegexCache[proxyPath] = new RegExp(cleansedRegex));
}

module.exports.matchPath = matchPath;
module.exports.generateMatchingRegex = generateMatchingRegex;
module.exports.getProxyFromBasePath = getProxyFromBasePath;
module.exports.normalizePath = normalizePath;
