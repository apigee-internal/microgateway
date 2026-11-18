'use strict';
//
const http = require('http');
const https = require('https');
const { v4: uuid } = require('uuid');
const _ = require('lodash');
const async = require('async');
const debug = require('debug')('gateway:main');
const logging = require('./logging')
const assert = require('assert');
const stats = require('./stats')
const OnDataTransform = require('./ondata-transform');
const configService = require('./config');
const buildNonTunnelOptions = require('./build-non-tunnel-options')
const checkNoProxy = require('./no-proxy-parser')
const empty_buffer = Buffer.alloc(0);
const onFinished   = require('on-finished');

//opentracing
var traceHelper = require('./trace-helper');
const METRICS = 'metrics';
//

const clientClosedRequestErrCode = 499;

const HOP_BY_HOP_HEADERS = ['connection', 'keep-alive', 'te', 'trailer', 'transfer-encoding', 'upgrade'];

const PROTECTED_CONN_HEADERS = new Set([
    'host', 'content-length', 'transfer-encoding',
    'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-request-id', 'via'
]);

function stripHopByHopHeaders(headers, connOnly) {
    if (headers.connection) {
        String(headers.connection).split(',').forEach(function(token) {
            const name = token.trim().toLowerCase();
            if (name && !PROTECTED_CONN_HEADERS.has(name)) {
                delete headers[name];
            }
        });
    }
    if (connOnly) {
        delete headers.connection;
    } else {
        HOP_BY_HOP_HEADERS.forEach(function(h) {
            delete headers[h];
        });
    }
}

// metrics_record is internal state set by the metrics plugin; ignore client-supplied header strings (b/586645803)
function getMetricsRecord(req) {
    const rec = req.headers['metrics_record'];
    return typeof rec === 'object' ? rec : null;
}

/**
 * injects plugins into gateway
 * @param pluginsSeqManager
 * @returns {Function(req,res,cb)}
 */
module.exports = function(pluginsSeqManager) {
    const logger = logging.getLogger();
    
    return function(sourceRequest, sourceResponse, next) {
        const startTime = sourceRequest.reqStartTimestamp ||  Date.now();
        pluginsSeqManager.setPluginSequence(sourceRequest);
        const plugins =  sourceRequest.preflowPluginSequence;
        const correlation_id = uuid();
        sourceRequest['correlationId'] = correlation_id;
        logger.setTransactionContext( correlation_id,sourceRequest);
        //opentracing
        sourceRequest = traceHelper.initTracer(sourceResponse.proxy.name, sourceRequest, correlation_id);
        //

        var len = JSON.stringify(sourceRequest.headers).length;
        debug("Request header: " + len);
        if (configService.get().edgemicro.maxHttpHeaderSize && len > configService.get().edgemicro.maxHttpHeaderSize) {
            sourceResponse.setHeader('Content-Type', 'application/json');
            sourceResponse.writeHead(400);
            sourceResponse.write('{"error":"header length more than allowed size"}');
            sourceResponse.end();
            const err = Error('header length more than allowed size');
            logger.eventLog({level:'error', req: sourceRequest, res: sourceResponse, err: err,component:'plugins-middleware'},'header length more than allowed size');
            // debug event log is applicable if logging:level = trace or bebug
            logger.eventLog({level:'debug', req: sourceRequest, res: sourceResponse, err: err,component:'plugins-middleware'},
            'header length='+len+' is more than allowed size='+configService.get().edgemicro.maxHttpHeaderSize+', header='+JSON.stringify(sourceRequest.headers));
            //opentracing
            traceHelper.setRequestError('','header length more than allowed size','', 400);
            // on failed condition maxHttpHeaderSize, sending metrics data to master node. 
            if(plugins && plugins[plugins.length-1].id === METRICS){
                makeMetricsRecord(sourceRequest, sourceResponse);
            }
            return next(false);
        } else {
            logger.eventLog({
                level:'info',
                req: sourceRequest,
                component:'plugins-middleware'
            }, 'sourceRequest');
            debug('sourceRequest', correlation_id, sourceRequest.method, sourceRequest.url);
            stripHopByHopHeaders(sourceRequest.headers, true);
            //process the requests
            async.series(
                //onrequest
                getPluginHooksForEvent(null, {
                    plugins: plugins,
                    sourceRequest: sourceRequest,
                    sourceResponse: sourceResponse
                }),
                function(err) {
                    if (_.isBoolean(err) && err) {
                        logger.eventLog({ level: 'error', req: sourceRequest, res: sourceResponse, err: err, component: 'plugins-middleware' }, `source request stucked! error : ${JSON.stringify(err)}`);
                        return next(false);
                    }
                    if (err) {
                        // on request failed, sending metrics data to master node. 
                        logger.eventLog({ level: 'error', req: sourceRequest, res: sourceResponse, err: err, component: 'plugins-middleware' }, 'source request failed.');
                        const metricsRecord = getMetricsRecord(sourceRequest);
                        if(metricsRecord){
                            metricsRecord['proxy_status_code'] = sourceResponse.statusCode;
                            sendMetricsData(metricsRecord);
                        }
                        return next(err)
                    }
                    if (sourceRequest.aborted) {
                        sourceResponse.statusCode = clientClosedRequestErrCode;
                        const err = new Error("source request aborted");
                        return next(err);
                    }
                    //opentrace
                    traceHelper.startTargetSpan(correlation_id, sourceRequest.targetHostname);
                    //closetrace
                    logger.debug({}, 'Request ID: ' + correlation_id +  ', sourceRequest success');

                    //create target request
                    const targetStartTime = Date.now();
                    const targetRequest = getTargetRequest(sourceRequest, sourceResponse, plugins, targetStartTime, correlation_id,
                        //callback for when response is initiated
                        (err, targetResponse) => {

                            if (err) {
                                // on target request failed, sending metrics data to master node. 
                                const metricsRecord = getMetricsRecord(sourceRequest);
                                if(metricsRecord){
                                    metricsRecord['proxy_status_code'] = sourceResponse.statusCode;
                                    if(targetResponse && targetResponse.statusCode !== 'undefined' && targetResponse.statusCode !== null){
                                        metricsRecord['target_status_code'] = targetResponse.statusCode;
                                    }
                                    metricsRecord['target_sent_timestamp'] = sourceRequest.headers['target_sent_start_timestamp'];
                                    metricsRecord['preflow_time'] = sourceRequest.headers['target_sent_start_timestamp'] - sourceRequest.headers['client_received_start_timestamp'];
                                    sendMetricsData(metricsRecord);
                                }
                                return next(err);
                            }
                            const options = {
                                start: startTime,
                                targetStartTime: targetStartTime,
                                correlation_id: correlation_id,
                                plugins: plugins,
                                sourceRequest: sourceRequest,
                                sourceResponse: sourceResponse,
                            };

                            handleTargetResponse(targetRequest, targetResponse, options, function(err) {
                                try {
                                    if (err) {
                                        // on target response failed, sending metrics data to master node. 
                                        const metricsRecord = getMetricsRecord(sourceRequest);
                                        if(metricsRecord){
                                            if(targetResponse && targetResponse.statusCode !== 'undefined' && targetResponse.statusCode !== null){
                                                metricsRecord['proxy_status_code'] = targetResponse.statusCode;
                                                metricsRecord['target_status_code'] = targetResponse.statusCode;
                                            }
                                            metricsRecord['target_sent_timestamp'] = sourceRequest.headers['target_sent_start_timestamp'];
                                            metricsRecord['preflow_time'] = sourceRequest.headers['target_sent_start_timestamp'] - sourceRequest.headers['client_received_start_timestamp'];
                                            sendMetricsData(metricsRecord);
                                        }
                                        next(err);
                                    } else {
                                        //opentracing
                                        traceHelper.finishRequestSpan();
                                        //
                                        next();
                                    }
                                } catch (errors) {
                                    debug(errors);
                                }
                            })
                        });

                    //initiate request piping
                    logger.debug({}, 'Request ID: ' + correlation_id  + ', Initiate request piping'); 
                    subscribeToSourceRequestEvents(plugins, sourceRequest, sourceResponse, targetRequest);
                    targetRequest.on('close', function() {
                        debug('sourceRequest close');
                    });
                });
        }
    }

};

/**
 * Create the target request
 * @param plugins
 * @param correlation_id
 * @param sourceRequest
 * @param sourceResponse
 * @param cb
 * @private
 */
function getTargetRequest(sourceRequest, sourceResponse, plugins, startTime, correlation_id, cb) {
    const gatewayTimeOutErrCode = 504;
    const gatewayBadErrCode = 502; 
    const logger = logging.getLogger();
    const config = configService.get();

    const proxy = sourceResponse.proxy;
    //capture the timestamp just before sending the data to the target server
    sourceRequest.headers['target_sent_start_timestamp'] = Date.now();

    // try to pass through most of the original request headers unmodified
    const target_headers = _.clone(sourceRequest.headers);
    const hasBody = Boolean(target_headers['content-length'] || target_headers['transfer-encoding']);
    stripHopByHopHeaders(target_headers, false);
    //create request id only if the source doesn't have it.
    if (_configured(config, 'x-request-id') && !target_headers['x-request-id']) {
        // https://devcenter.heroku.com/articles/http-request-id
        target_headers['x-request-id'] =
            config.uid + '.' + correlation_id.toString();
    }

    if (_configured(config, 'x-forwarded-proto') && !target_headers['x-forwarded-proto']) {
        target_headers['x-forwarded-proto'] = sourceRequest.connection.encrypted ? 'https' : 'http';
    }

    if (_configured(config, 'x-forwarded-for')) {
        // append client address to the x-forwarded-for header
        var forwarded_for = target_headers['x-forwarded-for'] || '';
        if (forwarded_for.length > 0) {
            forwarded_for += ',';
        }
        forwarded_for += sourceRequest.socket.remoteAddress;
        target_headers['x-forwarded-for'] = forwarded_for;
    }

    var hostname = target_headers.host;
    if ( hostname ) { // might be missing (with an http-1.0 client for example)

        if (_configured(config, 'x-forwarded-host')) {
            // append host header to the x-forwarded-host header
            var forwarded_host = target_headers['x-forwarded-host'] || '';
            if (forwarded_host.length > 0) {
                forwarded_host += ',';
            }
            forwarded_host += hostname;
            target_headers['x-forwarded-host'] = forwarded_host;
        }

        const colon = hostname.indexOf(':');
        if (colon > 0) {
            hostname = hostname.substring(0, colon); // strip port if present
        }

        if (_configured(config, 'via')) {
            // append our hostname (but not the port), if present, to the via header
            var via = target_headers['via'] || '';
            if (via.length > 0) {
                via += ',';
            }
            via += sourceRequest.httpVersion + ' ' + hostname;
            target_headers['via'] = via;
        }

        // To avoid breaking backard compatibility, we need to remove the "Host" header unless explicitly told not to
        const resetHostHeader = config.headers && typeof config.headers.host !== 'undefined' ? config.headers.host : true;

        if (resetHostHeader === true) {
            delete target_headers.host;
        }
    }

    delete target_headers['content-length'];
    if (hasBody && (sourceRequest.method==='DELETE' || (sourceRequest.method==='OPTIONS' && Number(sourceRequest.headers['content-length']) !== 0) || (sourceRequest.method==='GET' && config.edgemicro.enable_GET_req_body))) {
        target_headers['transfer-encoding'] = 'chunked';
    }

    var httpLibrary = http;
    //changes to support target overrides
    if (sourceRequest.targetSecure || proxy.secureHttpProxy) {
        httpLibrary = https;
    }

    assert(httpLibrary.request, 'must have request method');

    var targetRequestOptions = {
        hostname: sourceRequest.targetHostname,
        port: parseInt(sourceRequest.targetPort), //proxy.parsedUrl.port,
        path: sourceRequest.targetPath,
        method: sourceRequest.method,
        headers: target_headers, // pass through the modified headers
        agent: proxy.agent
    };

    const httpProxyConfig = config.edgemicro.proxy ? config.edgemicro.proxy.url : null;
   
    //If we have a proxy configuration, but we aren't tunneling. 
    //Rewrite target request options to account for proxy configuration

    
    if ( httpProxyConfig && !proxy.tunnelEnabled && !proxy.shouldntUseProxy) {
        targetRequestOptions = buildNonTunnelOptions(proxy, targetRequestOptions, httpProxyConfig);
    }


    if (config.edgemicro.request_timeout) {
        targetRequestOptions.timeout = config.edgemicro.request_timeout * 1000;
    }
    
    if ( sourceRequest.targetTimeout && sourceRequest.targetTimeout > 0 ) { // override global timeout by proxy level timeout
        targetRequestOptions.timeout = sourceRequest.targetTimeout;
    }

    // TARGET REQUEST MADE HERE.  TARGET REQUEST
    const targetRequest = httpLibrary.request(targetRequestOptions,
        (targetResponse) => cb(null, targetResponse));

    // locally enforced timeout, other than relying on the http module timeout.
    const timeoutInterval = targetRequestOptions.timeout;
    if (timeoutInterval && timeoutInterval > 0 ) {
        targetRequest.setTimeout(timeoutInterval, () => {
            debug('request timed out, aborting');
            targetRequest._timedOut = true;
            targetRequest.abort();
        });
    }

    targetRequest.on('error', function(err) {

        if (targetRequest._timedOut) {
            sourceResponse.statusCode = gatewayTimeOutErrCode; // Gateway Time-out
        } else {
            sourceResponse.statusCode = gatewayBadErrCode; // Bad Gateway
        }

        logger.eventLog({level:'error',
            d: Date.now() - startTime,
            err: err,
            h: sourceRequest.transactionContextData.targetHostName,
            component:'plugins-middleware',
            transactionContextData: sourceRequest.transactionContextData
        }, 'targetRequest error');
        debug('targetRequest error', correlation_id, err.stack);
        async.series(getPluginHooksForEvent('error', {
                plugins: plugins,
                sourceRequest: sourceRequest,
                sourceResponse: sourceResponse,
                error: err
            }),
            function(e) {
                if (e) {
                    logger.eventLog({level:'error',req: sourceRequest, res: sourceResponse, err: e,component:'plugins-middleware'});
                    //opentracing
                    traceHelper.setResponseError(e, e.message, e.stack, e.statusCode);
                    //
                    cb(e);
                } else {
                    if (targetRequest._timedOut) {
                        //opentracing
                        traceHelper.setResponseError('','','', gatewayTimeOutErrCode);
                        //
                        cb(new Error("Gateway timed out trying to reach target"));
                    } else {
                        //opentracing
                        traceHelper.setResponseError('','','', gatewayBadErrCode);
                        //                        
                        cb(err);
                    }
                }
            });
    });

    // abort the target request if the connection from the sourceRequest/sourceResponse is closed.
    sourceResponse.on('close', function(e){
        if (sourceRequest.aborted) {
            debug('source request aborted - abort target request', correlation_id);
            sourceResponse.statusCode = clientClosedRequestErrCode;
            targetRequest.abort();
            logger.eventLog({
                level:'info',
                res: sourceResponse,
                req: sourceRequest,
                d: Date.now() - ( sourceRequest.headers['target_sent_start_timestamp'] || startTime ),
                component:'plugins-middleware'
            }, 'sourceResponse on close, source request aborted - abort target request');
        }
    });

    const logInfo = {
        level: 'info',
        h: sourceRequest.transactionContextData.targetHostName,
        component:'plugins-middleware',
        transactionContextData: sourceRequest.transactionContextData
    };
    // log target request options, minus agent
    logger.eventLog(logInfo, 'targetRequest');
    debug('targetRequest', correlation_id, targetRequestOptions.method, targetRequestOptions.hostname, targetRequestOptions.port, targetRequestOptions.path);
    stats.incrementRequestCount();
    return targetRequest;
}

/**
 * Handle the plugin wiring and response piping
 * @param targetRequest
 * @param targetResponse
 * @param options {start, correlation_id, plugins, sourceRequest, sourceResponse,promises}
 * @param cb
 * @private
 */
function handleTargetResponse(targetRequest, targetResponse, options, cb) {
    const start = options.targetStartTime;
    const correlation_id = options.correlation_id;
    const plugins = options.sourceRequest.postflowPluginSequence;
    const sourceRequest = options.sourceRequest;
    const sourceResponse = options.sourceResponse;
    const logger = logging.getLogger();
    const config = configService.get();

    sourceRequest.headers['target_response_code'] = targetResponse.statusCode;

    debug('targetResponse', correlation_id, targetResponse.statusCode);
    async.series(
        //onresponse
        getPluginHooksForEvent(null, {
            plugins: plugins,
            sourceRequest: sourceRequest,
            sourceResponse: sourceResponse,
            targetRequest: targetRequest,
            targetResponse: targetResponse
        }),
        function(err, results) {
            let logLevel = 'info';
            // Make log level Configurable for target error non 2xx
            if (config.edgemicro.logTargetErrorsAs && targetResponse.statusCode && targetResponse.statusCode / 100 !== 2) {
                logLevel = config.edgemicro.logTargetErrorsAs;
            } 
            logger.eventLog({
                level: logLevel,
                res: targetResponse,
                h: sourceRequest.transactionContextData.targetHostName,
                d: Date.now() - ( sourceRequest.headers['target_sent_start_timestamp'] || start ),
                component:'plugins-middleware',
                transactionContextData: sourceRequest.transactionContextData
            }, 'targetResponse');

            if ( err ) logger.eventLog({level:'error', req: sourceRequest, res: sourceResponse, err: err,component:'plugins-middleware'},"");
            if (sourceResponse.finished || sourceResponse.headersSent || sourceRequest.aborted) {
                sourceResponse.statusCode = clientClosedRequestErrCode;
                logger.eventLog({level:'error',req: sourceRequest, res: sourceResponse, err: err,component:'plugins-middleware'},"response finished before work can be done");
                return;
            }
            if (err) {
                //opentracing
                traceHelper.setResponseError(err, err.message, err.stack, err.statusCode);
                //
                return cb(err);
            }
            if (results !== undefined && results.length !== 0 && results[0] !== null) {
                debug(results);
            }
            stats.incrementStatusCount(targetResponse.statusCode);
            stats.incrementResponseCount();
            // the size of the body will change if any of the plugins transform the content
            // delete the response content-length to allow streaming.
            delete targetResponse.headers['content-length'];
            // propagate response headers from target to client
            Object.keys(targetResponse.headers).forEach(function(header) {
                // skip setting the 'connection: keep-alive' header
                // setting it causes gateway to not accept any more connections
                if (header !== 'connection') {
                    sourceResponse.setHeader(header, targetResponse.headers[header]);
                }
            });
            sourceResponse.statusCode = targetResponse.statusCode;
            if (targetResponse.statusMessage) {
                sourceResponse.statusMessage = targetResponse.statusMessage;
            }

            //opentrace
            if (targetResponse.statusCode > 399) {
                traceHelper.setResponseError('','','', targetResponse.statusCode);              
            } else {
                traceHelper.endTargetSpan(targetResponse.statusCode);
            }
            //closetrace

            if (_configured(config, 'x-response-time')) {
                sourceResponse.setHeader('x-response-time', Date.now() - start);
            }
            _subscribeToResponseEvents(plugins, sourceRequest, sourceResponse, targetRequest, targetResponse, correlation_id, options,
                function(err, result) {
                    cb(err, result)
                });
        });
}

/**
 * Properly set up request piping.
 * @param plugins
 * @param sourceRequest
 * @param sourceResponse
 * @param targetRequest
 * @private
 */
function subscribeToSourceRequestEvents(plugins, sourceRequest, sourceResponse, targetRequest) {
    const logger = logging.getLogger();
    const config = configService.get();

    // using apply on the array returned by getPluginHooksForEvent --> using a dummy object in place of this, which cannot be bound here.
    const onend_request_handlers = async.seq.apply({}, getPluginHooksForEvent('end', {
        plugins: plugins,
        sourceRequest: sourceRequest,
        sourceResponse: sourceResponse,
    }));

    var ondata_request_transform = new OnDataTransform({
        pluginHooks: getPluginHooksForEvent('data', {
            plugins: plugins,
            sourceRequest: sourceRequest,
            sourceResponse: sourceResponse
        })
    },sourceRequest,sourceResponse)

    ondata_request_transform.on('end', () => {
        onend_request_handlers(empty_buffer,
            function(err, result) {
                //opentracing
                traceHelper.endRequestSpan();
                //
                if (err) {
                    return logger.eventLog({level:'error', req: sourceRequest, res: sourceResponse, err: err,component:'plugins-middleware'});
                }

                if (result && result.length) {
                    targetRequest.write(result)
                }
                targetRequest.end()
            });
    });

    if ((targetRequest.method==='GET' && !config.edgemicro.enable_GET_req_body) || (targetRequest.method === "HEAD") || (targetRequest.method === "TRACE")) {
        targetRequest._hasBody = false;
    }

    sourceRequest
        .pipe(ondata_request_transform)
        .pipe(targetRequest,{end : false});
}

/**
 * Properly set up response piping.
 * @param plugins
 * @param sourceRequest
 * @param sourceResponse
 * @param targetRequest
 * @param targetResponse
 * @param correlation_id
 * @param start
 * @param cb
 * @private
 */
function _subscribeToResponseEvents(plugins, sourceRequest, sourceResponse, targetRequest, targetResponse, correlation_id, options, cb) {
    const logger = logging.getLogger();
    const start = options.start;
    const gatewayBadErrCode = 502;
    const config = configService.get();
    const targetStartTime = options.targetStartTime || start;
    //
    // using apply on the array returned by getPluginHooksForEvent --> using a dummy object in place of this, which cannot be bound here.
    const onend_response_handlers = async.seq.apply({}, getPluginHooksForEvent('end', {
        plugins: plugins,
        sourceRequest: sourceRequest,
        sourceResponse: sourceResponse,
        targetRequest: targetRequest,
        targetResponse: targetResponse
    }));

    var endStream = true;
    var accumulatePresent = plugins.some((p) => {
        return (p.id === 'accumulate-response');
    });

    var chunkedTransfer = (targetResponse.headers['transfer-encoding'] === 'chunked');

    if (accumulatePresent && chunkedTransfer) {
        endStream = false;
    }

    var ondata_response_transform = new OnDataTransform({
        pluginHooks: getPluginHooksForEvent('data', {
            plugins: plugins,
            sourceRequest: sourceRequest,
            sourceResponse: sourceResponse,
            targetRequest: targetRequest,
            targetResponse: targetResponse
        })
    },sourceRequest,sourceResponse);

    ondata_response_transform.on('end', () => {
        onend_response_handlers(empty_buffer,
            function(err, result) {
                if (err) {
                    logger.eventLog({level:'error',req: sourceRequest, res: sourceResponse, err: err,component:'plugins-middleware'});
                }
                if (!sourceResponse.writableFinished) {
                    if (result && result.length) {
                        sourceResponse.end(result);
                    } else {
                        sourceResponse.end();
                    }
                    debug('sourceResponse close', correlation_id, sourceResponse.statusCode);
                    logger.eventLog({
                        level:'info',
                        res: sourceResponse,
                        req: sourceRequest,
                        d: Date.now() - sourceRequest.reqStartTimestamp || start,
                        component:'plugins-middleware'
                    }, 'sourceResponse' );
                }
                // on finished of response, sending data to master node 
                onFinished(sourceResponse, function(err, sourceResponse) {
                    const metricsRecord = getMetricsRecord(sourceRequest);
                    if(metricsRecord){
                        sendMetricsData(metricsRecord);
                    }
                });
                return cb(err, result);
            });
    });

    targetResponse
        .pipe(ondata_response_transform)
        .pipe(sourceResponse, {
            end: false
        });

    targetResponse.on('close', function() {
        if(targetResponse.aborted) {
            debug('targetResponse aborted', correlation_id);

            sourceResponse.statusCode = gatewayBadErrCode;

            logger.eventLog({
                level: 'warn',
                res: targetResponse,
                h: sourceRequest.transactionContextData.targetHostName,
                d: Date.now() - (sourceRequest.headers['target_sent_start_timestamp'] || targetStartTime),
                component: 'plugins-middleware',
                transactionContextData: sourceRequest.transactionContextData
            }, 'targetResponse aborted');
     
            if (config.edgemicro.on_target_response_abort == 'appendErrorToClientResponseBody') {
                const err = new Error("Target response ended prematurely.");
                err.code = "TargetResponseAborted";
                return cb(err);
            }
            else if (config.edgemicro.on_target_response_abort == 'abortClientRequest') {
                sourceRequest.destroy();
            }
        }
        else {
            debug('targetResponse close', correlation_id);
            logger.eventLog({
                level:'info',
                res: targetResponse,
                h: sourceRequest.transactionContextData.targetHostName,
                d: Date.now() - ( sourceRequest.headers['target_sent_start_timestamp'] || targetStartTime ),
                component:'plugins-middleware',
                transactionContextData: sourceRequest.transactionContextData
            }, 'targetResponse close');
        }
    });

    targetResponse.on('error', function(err) {
        logger.eventLog({
            level:'error',
            res: targetResponse,
            h: sourceRequest.transactionContextData.targetHostName,
            d: Date.now() - ( sourceRequest.headers['target_sent_start_timestamp'] || targetStartTime ),
            err: err,
            component:'plugins-middleware',
            transactionContextData: sourceRequest.transactionContextData
        }, 'targetResponse error');

        debug('targetResponse error', correlation_id, err.stack);
        async.series(getPluginHooksForEvent('error', {
                plugins: plugins,
                sourceRequest: sourceRequest,
                sourceResponse: sourceResponse,
                targetRequest: targetRequest,
                targetResponse: targetResponse,
                error:err
            }),
            function(err) {
                cb(err)
            });
    });
}

const getPluginHooksForEvent = function(type, options) {
    const plugins = options.plugins;
    const logger = logging.getLogger();
    logger.debug({}, 'Request ID: ' + options.sourceRequest['correlationId']  + `, preparing plugin map for type '${type}' & length -  '${plugins.length}'`);
    const pluginMap = plugins.map((plugin) => getPluginHookForEvent(plugin, type, options));
    return pluginMap;
};

function getPluginHookForEvent(plugin, type, options) {
    const isRequest = !options.targetRequest;
    const logger = logging.getLogger();

    //return handler
    return (data, cb) => {
        cb = _.isFunction(data) ? data : cb;
        data = _.isFunction(data) ? null : data;
        try {

            const handler = (type ? type + '_' : '') + (isRequest ? 'request' : 'response');
            if (plugin['on' + handler] && _.isFunction(plugin['on' + handler])) {
                const fx = function(e) {  // }, newData) {  // jshint but allowing arg to be passed without access to it
                    //a small fix introduced to fix issues with plugin API being inconsistent with documentation.
                    //Pass a second null to ondata_response event callback then you are able to override the response body
                    logger.debug({}, 'Request ID: ' + options.sourceRequest['correlationId']  + `, callback executed successfully for handler '${'on' + handler}' of plugin '${plugin.id}'`);
                    var args = Array.prototype.slice.call(arguments);
                    if (args.length === 2) {
                        cb(e, args[1]);
                    } else {
                        cb(e, data);
                    }
                };

                var pluginHandler = plugin['on' + handler];
                var argsLength = pluginHandler.length;
                var args = null;

                //introduced options.error for specifying the error(if found and declared) on all error events
                if(options.error){
                    data = options.error;
                }
                if (argsLength === 3) {
                    args = [options.sourceRequest, options.sourceResponse, fx];
                } else if (argsLength === 4) {
                    args = [options.sourceRequest, options.sourceResponse, data, fx];
                } else if (argsLength === 5) {
                    args = [options.sourceRequest, options.sourceResponse, options.targetResponse, data, fx];
                }

                logger.debug({}, 'Request ID: ' + options.sourceRequest['correlationId'] + `, executing plugin handler '${'on' + handler}' of plugin '${plugin.id}'`);
                pluginHandler.apply(null, args);
            } else {
                logger.debug({}, 'Request ID: ' + options.sourceRequest['correlationId']  + `, plugin '${plugin.id}' does not provide handler function for '${'on' + handler}'`);
                debug("plugin " + plugin.id + " does not provide handler function for " + handler);
                cb(null, data); // plugin does not provide onerror_request, carry on
            }
        } catch (handlerException) {
            logger.eventLog({level:'error',req: options.sourceRequest, res: options.sourceResponse, err: handlerException,component:'plugins-middleware'}, plugin.id + " handler threw an exception")
            cb(handlerException)
        }

    }
}

module.exports.getPluginHookForEvent = getPluginHookForEvent;

const _configured = function(config, property) {
    if (config.headers) {
        const value = config.headers[property];
        return value ? value : _.isUndefined(value); // on if unspecified
    } else {
        return true; // on if no config.headers section
    }
};

function makeMetricsRecord(req, res) {
    let record = {};
    record['proxy_name'] = res.proxy.name;
    record['proxy_url'] = res.proxy.url;
    record['proxy_basepath'] = res.proxy.base_path;
    record['target_host'] = req.targetHostname;
    record['target_url'] = ( req.targetSecure ? 'https' : 'http' ) + 
                            '://' + req.targetHostname + 
                            ( req.targetPort ? ':' + req.targetPort : "") + req.targetPath;

    record['proxy_status_code'] = res.statusCode;
    sendMetricsData(record);
}

function sendMetricsData(record) {
    debug('sending metrics record to master node');
    process.send({
        type: 'metricsData',
        data: record
    });
}
