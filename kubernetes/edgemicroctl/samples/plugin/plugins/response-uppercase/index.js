module.exports.init = function(config, logger, stats) {

  return {
    
   ondata_response: function(req, res, data, next) {
      var transformed = data.toString().toUpperCase();
      next(null, transformed);
    } 
  };
}
