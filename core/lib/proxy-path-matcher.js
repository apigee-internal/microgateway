'use strict';

const matchPath = (requestPath, proxyPath) => {
  if ( requestPath.charAt(requestPath.length-1) !== '/') {
    requestPath += '/';
  }
  if ( proxyPath.charAt(proxyPath.length-1) !== '/') {
    proxyPath += '/';
  }
  var pathRegex = generateMatchingRegex(proxyPath);
  return pathRegex.test(requestPath);
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
  const cleansedRegex = '^' + proxyPath.replace(/\*{2,}|\*|\?|[-[\]{}()+.,\\^$|#\s]/g, (match, offset) => {
    if (match === '?') return '[^/]';
    if (match[0] !== '*') return '\\' + match;
    const atStart = offset === 0 || proxyPath[offset - 1] === '/';
    const atEnd = offset + match.length === proxyPath.length || proxyPath[offset + match.length] === '/';
    if (match.length > 1 && atStart && atEnd) return '.*';
    return (atStart ? '(?!\\.)' : '') + (atStart && atEnd ? '[^/]+' : '[^/]*');
  });
  return (generatedRegexCache[proxyPath] = new RegExp(cleansedRegex));
}

module.exports.matchPath = matchPath;
module.exports.generateMatchingRegex = generateMatchingRegex;
module.exports.getProxyFromBasePath = getProxyFromBasePath;
