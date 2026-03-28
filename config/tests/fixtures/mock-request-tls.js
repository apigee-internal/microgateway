const path = require('path');
var io = require('../../lib/io')();

var proxies = {
  "apiProxies": [
    {
      "apiProxyName": "edgemicro_proxyOne",
      "revision": "1",
      "proxyEndpoint": { "name": "default", "basePath": "/proxyOne" },
      "targetEndpoint": { "name": "default", "url": "http://localhost:8080/" }
    }
  ]
};

var products = {
  "apiProduct": [
    {
      "apiResources": ["/**"],
      "approvalType": "auto",
      "attributes": [
        {
          "name": "access",
          "value": "public"
        }
      ],
      "createdAt": 123456789,
      "createdBy": "test@example.com",
      "description": "",
      "displayName": "productOne",
      "environments": ["test"],
      "lastModifiedAt": 123456789,
      "lastModifiedBy": "test@example.com",
      "name": "productOne",
      "proxies": ["edgemicro_proxyOne"],
      "scopes": [""]
    }
  ]
};

var certificate =
  `-----BEGIN CERTIFICATE-----
  MII...
  -----END CERTIFICATE-----`;

var extauthPublicKey = {
  "keys": [
    {
      "kty": "RSA",
      "alg": "RS256"
    }
  ]
}

module.exports = {
  get: function (options, callback) {
    if (options.rejectUnauthorized !== false) {
      return callback(new Error('rejectUnauthorized was not set to false'));
    }

    const configPath = path.join(__dirname, 'load-dummy-eval-test-tls.yaml');
    var config = io.loadSync({ source: configPath });
    switch (options.url) {
      case config.edge_config.bootstrap:
        return callback(null, { statusCode: 200 }, JSON.stringify(proxies));
      case config.edge_config.jwt_public_key:
        return callback(null, { statusCode: 200 }, JSON.stringify(certificate));
      case config.edge_config.products:
        return callback(null, { statusCode: 200 }, JSON.stringify(products));
      case config.extauth.publickey_url:
        return callback(null, { statusCode: 200 }, JSON.stringify(extauthPublicKey))
      default:
        return callback(new Error(`incorrect url: ${options.url}`));
    }
  }
};
