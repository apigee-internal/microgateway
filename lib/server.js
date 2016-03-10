const restify = require('restify');
const restifyServer = restify.createServer({});

restifyServer.use(restify.gzipResponse());
restifyServer.use(restify.bodyParser());

var Server = function(config, gatewayServer) {
  this.port = config.agent.port || process.env.PORT || 9000;
  this.hostname = config.agent.address || process.env.ADDRESS;
  this.gatewayServer = gatewayServer;
  this.config = config;
  // initialize new express app and begin set up
  restifyServer.get({ path: '/config' }, (req, res) => { });
  restifyServer.post({ path: '/config' }, (req, res) => { })
  restifyServer.put({ path: '/config' }, (req, res) => { });
}

module.exports = function(config, gatewayServer) {
  return new Server(config, gatewayServer);
}

Server.prototype.start = function() {
  const hostName = this.hostname;
  const port = this.port;
  if (hostName) {
    restifyServer.listen(port, hostName, function() {
      console.info( 'edge micro agent listening on', hostName + ':' + port);
    });
  } else {
    restifyServer.listen(port, function() {
      console.info( 'edge micro agent listening on', port);
    });
  }
}

Server.prototype.close = function() {
  restifyServer.close();
}

