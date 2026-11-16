'use strict';

//const util = require('util');

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

// Same regex minimatch@10 makeRe() built (default options) for base paths made of
// literal characters, '*', '?', '**' segments and repeated '/'; minimatch@11 removed makeRe.
const escapeRe = (s) => s.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
const twoStar = '(?:(?!(?:\\/|^)\\.).)*?';
const toSegmentRegex = (seg) => {
  if (!/[*?]/.test(seg)) {
    return escapeRe(seg);
  }
  const body = seg.replace(/\*+|\?|[^*?]/g, (c) =>
    c === '?' ? '[^/]' : c[0] === '*' ? (/^\*+$/.test(seg) ? '[^/]+?' : '[^/]*?') : escapeRe(c));
  return (/^\.\.?[*?]/.test(seg) ? '(?!(?:^|\\/)\\.\\.?(?:$|\\/))' : /^[*?]/.test(seg) ? '(?!\\.)' : '') + body;
};

const generateMatchingRegex = (proxyPath) => {
  if(generatedRegexCache[proxyPath]) {
    return generatedRegexCache[proxyPath];
  }
  const parts = proxyPath.split(/\/+/).reduce((acc, p) => {
    const prev = acc[acc.length - 1];
    if (p === '**' && prev === '**') return acc;
    if (p === '..' && prev && prev !== '..' && prev !== '.' && prev !== '**') { acc.pop(); return acc; }
    acc.push(p);
    return acc;
  }, []);
  const re = (parts.length ? parts : ['']).map((p) => (p === '**' ? null : toSegmentRegex(p)));
  re.forEach((p, i) => {
    const prev = re[i - 1];
    const next = re[i + 1];
    if (p !== null || prev === null) return;
    if (prev === undefined) {
      if (next !== undefined && next !== null) re[i + 1] = '(?:\\/|' + twoStar + '\\/)?' + next;
      else re[i] = twoStar;
    } else if (next === undefined) {
      re[i - 1] = prev + '(?:\\/|\\/' + twoStar + ')?';
    } else if (next !== null) {
      re[i - 1] = prev + '(?:\\/|\\/' + twoStar + '\\/)' + next;
      re[i + 1] = null;
    }
  });
  //minimatch creates a regex that will hard match the path. 
  //we remove the end of input so it can match proxy path and extras
  const cleansedRegex = ('^' + re.filter((p) => p !== null).join('\\/') + '$').replace('$', '');
  return (generatedRegexCache[proxyPath] = new RegExp(cleansedRegex));
}

module.exports.matchPath = matchPath;
module.exports.generateMatchingRegex = generateMatchingRegex;
module.exports.getProxyFromBasePath = getProxyFromBasePath;
