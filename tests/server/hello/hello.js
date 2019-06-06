var restify = require('restify');


module.exports = function (useRoot) {

  function respond(req, res, next) {
    console.log('HELLO HELLO HELLO HELLO HELLO request received');
    var key = req.params.key;
    var value = req.params.key;
    var returnVal = {};
    returnVal[key] = value  || "unknown";
    if(req.body){
      returnVal.body = req.body;
    }
    res.json(200, returnVal, {});
    next();
  }

  var server = restify.createServer({});

  server.use(restify.gzipResponse());
  server.use(restify.bodyParser());

  server.get('/echo/:key', respond);

  server.post({
    path: '/echo/:key'
  }, respond);
  server.put({
    path: '/echo/:key'
  }, respond);
    
  server.del({
    path: '/echo/:key'
  }, respond);
  

  server.post({
    path: '/edgemicro_hello'
  }, respond);
  server.put({
    path: '/edgemicro_hello'
  }, respond);

  server.del({
    path: '/edgemicro_hello'
  }, respond);
  
  server.get('/edgemicro_hello', respond);

  server.get('/', respond);

  return server;

};