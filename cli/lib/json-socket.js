var net = require('net');

var JsonSocket = function(socket) {
    this._socket = socket;
    this._contentLength = null;
    this._buffer = '';
    this._closed = false;
    socket.on('data', this._onData.bind(this));
    socket.on('close', this._onClose.bind(this));
    socket.on('err', this._onError.bind(this));
};

JsonSocket.prototype = {

    _onData: function(data) {
        data = data.toString();
        try {
            this._handleData(data);
        } catch (e) {
            this.sendError(e);
        }
    },

    _handleData: function(data) {
        this._buffer += data;
        if (this._contentLength == null) {
            let i = this._buffer.indexOf('#');
            // Check if the buffer has a #, if not, the end of the buffer string might be in the middle of a content length string
            if (i !== -1) {
                let rawContentLength = this._buffer.substring(0, i);
                this._contentLength = parseInt(rawContentLength);
                if (isNaN(this._contentLength)) {
                    this._contentLength = null;
                    this._buffer = '';
                    let err = new Error('Invalid content length supplied (' + rawContentLength + ') in: ' + this._buffer);
                    err.code = 'E_INVALID_CONTENT_LENGTH';
                    throw err;
                }
                this._buffer = this._buffer.substring(i + 1);
            }
        }
        if (this._contentLength != null) {
            if (this._buffer.length == this._contentLength) {
                this._handleMessage(this._buffer);
            } else if (this._buffer.length > this._contentLength) {
                let message = this._buffer.substring(0, this._contentLength);
                let rest = this._buffer.substring(this._contentLength);
                this._handleMessage(message);
                this._onData(rest);
            }
        }
    },

    _handleMessage: function(data) {
        this._contentLength = null;
        this._buffer = '';
        let message;
        try {
            message = JSON.parse(data);
        } catch (e) {
            let err = new Error('Could not parse JSON: ' + e.message + '\nRequest data: ' + data);
            err.code = 'E_INVALID_JSON';
            throw err;
        }
        message = message || {};
        this._socket.emit('message', message);
    },

    sendError: function(err) {
        this.sendMessage(this._formatError(err));
    },

    _formatError: function(err) {
        return {
            success: false,
            error: err.toString()
        };
    },

    sendMessage: function(message, callback) {
        if (this._closed) {
            if (callback) {
                callback(new Error('The socket is closed.'));
            }
            return;
        }
        this._socket.write(this._formatMessageData(message), 'utf-8', callback);
    },

    _formatMessageData: function(message) {
        let messageData = JSON.stringify(message);
        let data = messageData.length + '#' + messageData;
        return data;
    },

    _onClose: function() {
        this._closed = true;
    },

    _onError: function() {
        this._closed = true;
    },

    isClosed: function() {
        return this._closed;
    },

};

var delegates = [
    'connect',
    'on',
    'end',
];

delegates.forEach(function(method) {
    JsonSocket.prototype[method] = function() {
        this._socket[method].apply(this._socket, arguments);
        return this;
    };
});

module.exports = JsonSocket;

// Code inspired from https://github.com/sebastianseilund/node-json-socket under MIT license.