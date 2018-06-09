'use strict';

var cb = null;
var middleware = function(req, res, next) {
    cb && cb(req, res);
    next();
};
module.exports = {
    init: function(config, logger, stats) {
        return {
            onrequest: function(req, res, next) {
                middleware(req, res, next);
            },
        };
    },
    setCb: (new_cb) => {
        cb = new_cb;
    },
};
