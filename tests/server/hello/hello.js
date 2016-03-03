var http = require('http');
var url = require('url');

var port = process.env.PORT || 1337;
http.createServer(function (req, res) {
  var reqUrl = url.parse(req.url, true);
  var delay = reqUrl.pathname.length > 1 ? +(reqUrl.pathname.substring(1)) : 0;
  if (delay && typeof delay === 'number') {
    setTimeout(function() {
      handler(req, res);
    }, Math.random() * delay);
  } else {
    handler(req, res);
  }
}).listen(port);
console.log('Server running on port', port);

var handler = function(req, res) {
  // echo request headers back as response headers for debugging
  Object.keys(req.headers).forEach(function(header) {
    res.setHeader(header, req.headers[header]);
  });
  res.writeHead(200, {'Content-Type': 'text/plain'});
  res.end('Hello World\n');
};
