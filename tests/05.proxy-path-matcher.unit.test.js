'use strict';

const assert = require('assert');
const proxyPathMatcher = require('../core/lib/proxy-path-matcher');

describe('proxy-path-matcher module', () => {
  it('matches literal base paths and rejects partial segment prefix collisions', () => {
    assert.strictEqual(proxyPathMatcher.matchPath('/v1', '/v1'), true);
    assert.strictEqual(proxyPathMatcher.matchPath('/v1/', '/v1'), true);
    assert.strictEqual(proxyPathMatcher.matchPath('/v1/users/123', '/v1'), true);
    assert.strictEqual(proxyPathMatcher.matchPath('/v10/users', '/v1'), false);
    assert.strictEqual(proxyPathMatcher.matchPath('/v2/users', '/v1'), false);
  });

  it('matches wildcard (*, **, ?) base paths', () => {
    assert.strictEqual(proxyPathMatcher.matchPath('/v1/acct/users', '/v1/*'), true);
    assert.strictEqual(proxyPathMatcher.matchPath('/v1/.hidden/users', '/v1/*'), false);
    assert.strictEqual(proxyPathMatcher.matchPath('/v1/.hidden_foo/users', '/v1/*foo'), false);
    assert.strictEqual(proxyPathMatcher.matchPath('/v1/my_foo/users', '/v1/*foo'), true);
    assert.strictEqual(proxyPathMatcher.matchPath('/v1/foo/users', '/v1/foo*'), true);
    assert.strictEqual(proxyPathMatcher.matchPath('/v1/foobar/users', '/v1/foo*'), true);
    assert.strictEqual(proxyPathMatcher.matchPath('/v1/acct/items/42', '/v1/*/items'), true);
    assert.strictEqual(proxyPathMatcher.matchPath('/v1/acct/other/42', '/v1/*/items'), false);
    assert.strictEqual(proxyPathMatcher.matchPath('/v1/a/b/c', '/v1/**'), true);
    assert.strictEqual(proxyPathMatcher.matchPath('/v2/users', '/v?'), true);
    assert.strictEqual(proxyPathMatcher.matchPath('/v12/users', '/v?'), false);
  });

  it('strips matched base_path prefix cleanly for target routing', () => {
    const stripLiteral = proxyPathMatcher.generateMatchingRegex('/v1');
    assert.strictEqual('/v1/users/123'.replace(stripLiteral, ''), '/users/123');
    assert.strictEqual('/v1'.replace(stripLiteral, ''), '');

    const stripSingleWildcard = proxyPathMatcher.generateMatchingRegex('/v1/*');
    assert.strictEqual('/v1/acct/users'.replace(stripSingleWildcard, ''), '/users');

    const stripWildcard = proxyPathMatcher.generateMatchingRegex('/v1/*/items');
    assert.strictEqual('/v1/acct/items/42'.replace(stripWildcard, ''), '/42');
  });

  it('selects the proxy with the longest matching base_path', () => {
    const proxies = [
      { base_path: '/v1', name: 'root-v1' },
      { base_path: '/v1/users', name: 'users-v1' },
      { base_path: '/v2', name: 'root-v2' }
    ];
    const matched = proxyPathMatcher.getProxyFromBasePath(proxies, '/v1/users/profile');
    assert.ok(matched);
    assert.strictEqual(matched.name, 'users-v1');
    assert.strictEqual(proxyPathMatcher.getProxyFromBasePath(proxies, '/v3/none'), undefined);
  });

  it('handles repeated wildcards safely without catastrophic backtracking', () => {
    const start = Date.now();
    const re = proxyPathMatcher.generateMatchingRegex('/v1/**********a');
    assert.strictEqual(re.test('/v1/' + 'x'.repeat(2000) + 'b/'), false);
    assert.ok(Date.now() - start < 200);
  });
});
