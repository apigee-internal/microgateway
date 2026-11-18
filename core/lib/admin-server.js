'use strict'

const http = require('http')
const https = require('https')
const debug = require('debug')('gateway:admin-server')
const url = require('url');

const logging = require('./logging')
const CONSOLE_LOG_TAG = 'microgateway-core admin-server';

const CACHE_UPDATE_INTERVAL = 2000;

const PROXY_EXP_GRACE_PERIOD = 1000*60*60*24; // 24 hrs

const PROXY_NUMERIC_PROPERTIES = ['time_taken_preflow_total', 'time_taken_postflow_total', 'time_taken_target_total',
'time_taken_proxy_total', 'count_proxy_2xx', 'count_proxy_4xx', 'count_proxy_5xx', 'count_target_2xx','count_target_4xx',
'count_target_5xx', 'count_proxy_total_req', 'count_target_total_req_sent', 'count_target_total_res_received' ];

class AdminServer {

    constructor(port, address, ssl, isRolloverAll) {
        this.port = port;
        this.address = address;
        this.ssl = ssl;
        this.isRolloverAll = isRolloverAll;
        this.server = null;
        this.cachedResponse = new Map();
        this.cachedStatsResponse =  {};

        this.updateIntervalRef = setInterval(()=>{
            this.updateCachedStatsResponse();
        }, CACHE_UPDATE_INTERVAL);

        this.logger = logging.getLogger();
        this.cacheConfig = {
            proxies: []
        };
    }

    setCacheConfig(config){
        this.cacheConfig = config;
    }

    start(){

        const serverMiddleware = (req, res) => {
           this.processRequest(req, res);
        }

        if (this.ssl) {
            // Paths to certificate info must be absolute paths
            const options = {
                passphrase: this.ssl.passphrase,
                ca: this.ssl.ca,
                ciphers: this.ssl.ciphers,
                rejectUnauthorized: this.ssl.rejectUnauthorized,
                requestCert: this.ssl.requestCert,
                secureProtocol: this.ssl.secureProtocol,
                servername: this.ssl.servername,
                crl: this.ssl.crl
            }

            const key = this.ssl.key;
            const cert = this.ssl.cert;
            const pfx = this.ssl.pfx;
            const ca = this.ssl.ca;
            const crl = this.ssl.crl;

            if (key && cert) {
                options.key = fs.readFileSync(path.resolve(key), 'utf8');
                options.cert = fs.readFileSync(path.resolve(cert), 'utf8');
            }

            if (ca) {
                options.ca = fs.readFileSync(path.resolve(ca), 'utf8');
            }

            if (pfx) {
                //fix: do not read pfx as utf-8
                options.pfx = fs.readFileSync(path.resolve(pfx));
            }

            if (crl) {
                options.pfx = fs.readFileSync(path.resolve(crl));
            }
            debug('Creating server with ssl options: %j', options);
            this.server = https.createServer(options, serverMiddleware)
        } else {
            this.server = http.createServer(serverMiddleware);
        }

        if ( this.address ) {
            this.server.listen(this.port, this.address, (err) => {
                if (err) {
                    this.logger.info({ err: err,component:CONSOLE_LOG_TAG }, 'Error in stating admin server');
                    return;
                }
                this.logger.consoleLog('info',{component: CONSOLE_LOG_TAG}, 'admin server listening on ',
                this.address + ':' + this.server.address().port)
                debug('admin server listening on %s:%d',this.address,this.server.address().port);
            })
        } else {
            this.server.listen(this.port, '127.0.0.1', (err) => {
                if (err) {
                    this.logger.info({ err: err,component:CONSOLE_LOG_TAG }, 'Error in stating admin server');
                    return;
                }
                this.logger.info({ component:CONSOLE_LOG_TAG}, 'admin server listening on port ' + this.server.address().port);
                debug('admin server listening on port:%d', this.server.address().port);
            });
        }
    }

    registerServerEvents(){

        this.server.on('error', function(err, req, res) {

            this.logger.trace({ err: err,component: CONSOLE_LOG_TAG }, config.uid + 'failed in error handler');
            this.logger.eventLog({level:'error', req: req, res: res, err: err,component:CONSOLE_LOG_TAG}, "failed in error handler");

            if ( res ) {
                res.setHeader('Content-Type','application/json');
                res.statusCode = 503;
                res.end(JSON.stringify({"message": err}));
            }
        });

    }

    processRequest(req, res){
        let reqUrl = '';
        try {
            reqUrl = url.parse(req.url, true);

            res.setHeader('Content-Type','application/json');

            if ( reqUrl.pathname === '/stats' ) {
                res.end(JSON.stringify(this.cachedStatsResponse));
            } else {
                let urlStrings = reqUrl.pathname.split('/');
                if ( urlStrings.length === 3 && urlStrings[1] === 'stats' ) {
                    if ( this.cachedStatsResponse[ urlStrings[2] ]  ) {
                        res.end(JSON.stringify(this.cachedStatsResponse[urlStrings[2]]));
                    } else {
                        res.end(JSON.stringify({
                            message: 'No data available for this proxy'
                        }));
                    }
                } else {
                    res.end(JSON.stringify({
                        message: 'Invalid url'
                    }));
                }
            }
        } catch(err) {
            this.logger.eventLog({ level:'warn', err: err, component:CONSOLE_LOG_TAG},
            'Error in processing request: '+ reqUrl );
            res.statusCode = 503;
            res.end(JSON.stringify({
                message: err.message
            }));
        }
        
    }

    stop(){
        if (this.server) {
            this.logger.eventLog({ level:'info', err: err, component:CONSOLE_LOG_TAG},
            'Stopping the server' );
            this.server.close()
            this.server = undefined
        }
    }

    addMetricsRecord(record){

        try {
            let proxy = '';
            if ( this.cachedResponse.has(record.proxy_name) ) {
                proxy = this.cachedResponse.get(record.proxy_name);
            } else {
                proxy = {
                    name: record.proxy_name ,
                    url: record.proxy_url,
                    path: record.proxy_basepath,
                    target_host: record.target_host,
                    target_url: record.target_url
                }
                this.initNumericValues(proxy);
            }

            proxy.count_proxy_total_req++;
            if ( record.target_sent_timestamp ) {
                proxy.count_target_total_req_sent++;
            }
            if ( record.target_received_timestamp ) {
                proxy.count_target_total_res_received++;
            }
            proxy.time_taken_preflow_total+= record.preflow_time;
            proxy.time_taken_postflow_total+= record.postflow_time;
            proxy.time_taken_target_total+= record.target_time;
            proxy.time_taken_proxy_total+= record.proxy_time;

            if ( record.proxy_status_code >= 200 && record.proxy_status_code <= 500 ) {
                proxy[`count_proxy_${record.proxy_status_code.toString().charAt(0)}xx`]++;
            }

            if ( record.target_status_code >= 200 && record.target_status_code <= 500 ) {
                proxy[`count_target_${record.target_status_code.toString().charAt(0)}xx`]++;
            }

            if ( this.isRolloverAll ) {
                /**
                 * If any one value reached to MAX_SAFE_INTEGER then reset the values on proxy.
                 */
                if ( PROXY_NUMERIC_PROPERTIES.some( key => proxy[key] < 0 ||  proxy[key] >= Number.MAX_SAFE_INTEGER ) ) {
                    this.logger.eventLog({ level:'info', component:CONSOLE_LOG_TAG},
                    'Negative or max value reached for proxy:'+ JSON.stringify(proxy));
                    this.initNumericValues(proxy);
                }
            } else {
                 /**
                 * If value reaches to MAX_SAFE_INTEGER then reset the value.
                 */
                PROXY_NUMERIC_PROPERTIES.forEach( key => {
                    if ( proxy[key] < 0 ||  proxy[key] >= Number.MAX_SAFE_INTEGER ) {
                        this.logger.eventLog({ level:'info', component:CONSOLE_LOG_TAG},
                        'Negative or max value reached for :'+ key);
                        proxy[key] = 0;
                    }
                });
            }
            
            proxy.last_update_timestamp = Date.now();
            this.cachedResponse.set(record.proxy_name, proxy);

        } catch (err) {
            this.logger.eventLog({ level:'warn', err: err, component:CONSOLE_LOG_TAG},
            'Error in processing metrics record for proxy: %s'+ record.proxy_name );

        }
        
    }
    
    initNumericValues(proxy){
        PROXY_NUMERIC_PROPERTIES.forEach( key =>  proxy[key] = 0 )
    }

    updateCachedStatsResponse(){
        try {
            this.cachedStatsResponse = Object.create(null);
            for (let [proxyName, proxyValue] of this.cachedResponse) {
                
                this.cachedStatsResponse[proxyName] = proxyValue;
                /**
                 * if proxy is deleted / undeployed from env and 
                 * there are no requests on the proxy for longer time
                 * then delete the proxy from memory
                 */
                if ( (proxyValue.last_update_timestamp + PROXY_EXP_GRACE_PERIOD ) < Date.now() &&
                this.cacheConfig.proxies.findIndex( p => p.name === proxyName ) === -1 ) {
                    debug('Deleting unused proxy: %s', proxyName);
                    this.cachedResponse.delete(proxyName);
                    this.logger.eventLog({ level:'debug', component:CONSOLE_LOG_TAG}, 'Deleting unused proxy: '+ proxyName);
                }
            }

        } catch (err) {
            this.logger.eventLog({ level:'warn', err: err, component:CONSOLE_LOG_TAG},'Error in updating cachedStatsResponse');
        }
    }

    destroy(){
        clearInterval(this.updateIntervalRef);
    }

}

module.exports = AdminServer;