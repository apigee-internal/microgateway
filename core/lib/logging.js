
'use strict';

const fs = require('fs');
const mkdir = require('mkdirp');
const os = require('os');
const path = require('path');
const util = require('util');
const configService = require('./config')
const stats = require('./stats')
const assert = require('assert')
const { v4: uuid } = require('uuid');
const cluster = require('cluster')

const CONSOLE_LOG_TAG = 'microgateway-core logging';

var logger = null;
var logToConsole = false;
module.exports.init = function init(stubConfig, options) {
	if (!process.env.CurrentOrgName && !process.env.CurrentEnvironmentName && options) {
		process.env.CurrentOrgName = options.org;
		process.env.CurrentEnvironmentName = options.env;
	}

  const config = stubConfig || configService.get()
  assert(config, 'must have config')
  assert(config.uid, 'config must have uid');
  const uid = config.uid || uuid();

  const logConfig = config.edgemicro.logging;
  assert(logConfig, 'must have config.edgemicro.logging in config');
  logToConsole = !!logConfig.to_console;

  var rotation = 0;
  const logDir = logConfig.dir || process.cwd();
  var logFilePath = _calculateLogFilePath(logDir, uid, rotation);

  mkdir.sync(logDir);

  statsTimer(logConfig.stats_log_interval);

  // using a WriteStream here causes excessive memory growth under high load (with node v0.12.6, jul 2015)
  var logFileFd;
  var logFailWarn = false;
  var writeInProgress = false;
  var records = [];
  var offset = 0;
  var nextRotation = 0;
  var logFileOpenFailWarn = false;


  // buffer the write if a write is already in progress
  // https://nodejs.org/api/fs.html#fs_fs_write_fd_data_position_encoding_callback
  // "Note that it is unsafe to use fs.write multiple times on the same file without waiting for the callback."
  const writeLogRecordToFile = function (record,cb) {
    if (Date.now() > nextRotation) {
      if ( !logFileOpenFailWarn ) {
      rotation++;
     if (logFileFd) {
        fs.close(logFileFd);
      }
      logFilePath = _calculateLogFilePath(logDir, uid, rotation);
      if (cluster.isMaster) {
        if(!logToConsole) {
          writeConsoleLog('log', {component: CONSOLE_LOG_TAG}, 'logging to ' + logFilePath);
        }
      }
    }
      try {
        if(logConfig.disableStrictLogFile){
          logFileFd = fs.openSync(logFilePath, 'a', 0o0755);
         }else{
          logFileFd = fs.openSync(logFilePath, 'a', 0o0600);
         }
      } catch (e) {
        if ( !logFileOpenFailWarn ) {
          writeConsoleLog('log',{component: CONSOLE_LOG_TAG}, 'Error in creating log file: %s, error: %s',logFilePath, e.message);
          logFileOpenFailWarn = true;
        }
        writeLogRecordToConsole(record);
       return record;
      }
      logFileOpenFailWarn = false;
      nextRotation = Date.now() + ((logConfig.rotate_interval || 24) * 60 * 60 * 1000); // hours -> ms
    }

    if ( record ) records.push(record);
    if ( writeInProgress || (records.length === 0) ) {
      return record;
    }
    

    writeInProgress = true;
    const buffer = records.join('');
    records = [];

    fs.write(logFileFd, buffer, offset, 'utf8', function (err, written) {
      writeInProgress = false;

      if (err) {
        if (!logFailWarn) {
          // print warning once, dumping every failure to console would overwhelm the console
          writeConsoleLog('warn',{component: CONSOLE_LOG_TAG},'error writing log',err);
          logFailWarn = true;
        }
      } else {
        offset += written;
      }

      if (records.length > 0) {
        process.nextTick(function () {
          writeLogRecordToFile();
        });
      } else {
          if ( cb !== undefined ) {
              try {
                cb();
              } catch (e) {
                writeConsoleLog('log',{component: CONSOLE_LOG_TAG},e);
              }
          }
      }
    });
    return buffer;
  }

  const writeLogRecordToConsole = (record,cb) => {
    if(record) {
      if(record.startsWith('error') || record.startsWith('warn')) {
        writeConsoleLog('error',{component: CONSOLE_LOG_TAG},record);
      } else {
          process.stdout.write(record);
          if ( cb !== undefined ) {
              try {
                cb();
              } catch (e) {
                writeConsoleLog('log',{component: CONSOLE_LOG_TAG},e);
              }
          }
      }
    }
  }

  const writeLog = function (level, obj, msg, isTransactionLog) {
    if (!cluster.isMaster) {
      const rec = serializeLogRecord(level, logConfig.level, obj, msg, isTransactionLog, logConfig.stack_trace);
      if (process.connected) {
        process.send({level:level, msg: rec});
      }
       return rec;
    }
    return logger.writeLogRecord({msg:serializeLogRecord(level, logConfig.level, obj, msg, isTransactionLog, logConfig.stack_trace)});
  }
  logger = {
    trace: function (obj, msg) {
      return writeLog('trace', obj, msg);
    },
    debug: function (obj, msg) {
      return writeLog('debug', obj, msg);
    },
    info: function (obj, msg) {
      return writeLog('info', obj, msg);
    },
    warn: function (obj, msg) {
      return writeLog('warn', obj, msg);
    },
    error: function (obj, msg) {
      return writeLog('error', obj, msg);
    },
    eventLog: function (obj, msg) {
      if ( obj.level ) {
        return writeLog(obj.level, obj, msg, true);
      } else {
        return null;
      }
    },
    consoleLog: function (level, obj, ...data) {
      return writeConsoleLog(level, obj, ...data);
    },
    stats: function (statsInfo, msg) {
      return writeLog('stats', { stats: statsInfo }, msg);
    },
    setLevel: function (level) {
      logConfig.level = level;
    },
    writeLogRecord: function(record,cb) {   
      const writeRecordToOutput = logToConsole ? writeLogRecordToConsole : writeLogRecordToFile;
      if ( record && record.msg ) writeRecordToOutput(record.msg,cb);
      return record;
    },
    setTransactionContext: ( correlation_id,sourceRequest) => {
      let clientIP =  ( (sourceRequest.socket && sourceRequest.socket.remoteAddress) ? sourceRequest.socket.remoteAddress : '');
      clientIP = clientIP ? clientIP.replace('::ffff:','') : ''; 
      if ( !isValidIPaddress(clientIP) ) {
        clientIP = '';
      }
      let targetPortStr = '';
      if ( !isNaN(parseInt(sourceRequest.targetPort)) ) {
        targetPortStr = ':'+ parseInt(sourceRequest.targetPort);
      }
      sourceRequest.transactionContextData = {
        correlation_id: correlation_id,
        method: sourceRequest.method,
        url: sourceRequest.url,
        host: (sourceRequest.headers ? sourceRequest.headers.host : ''),
        clientId: (sourceRequest.headers ? sourceRequest.headers['x-api-key'] : ''),
        remoteAddress: (sourceRequest.socket ? (sourceRequest.socket.remoteAddress + ':' + sourceRequest.socket.remotePort) : ':0'),
        clientIP: clientIP,
        targetHostName: sourceRequest.targetHostname + targetPortStr
      }
    },
    traceHelper: require('./trace-helper')
  };


  if (cluster.isMaster) {
    if(logToConsole) {
      writeConsoleLog('log',{component: CONSOLE_LOG_TAG},'logging to console');
    } 

    Object.keys(cluster.workers).forEach((id) => {
      cluster.workers[id].on('message', function (msg) {
        if ( msg && msg.msg ) logger.writeLogRecord(msg.msg);
      });
    });
  }


  return logger;
}
module.exports.getLogger = function () {
  return logger;
}

const writeConsoleLog = function (level, obj, ...dataList) {
  // uncomment the below condition to disable the blank console logs
  if ( console[level] /*&& dataList && dataList.length > 0*/ ) {
    const Timestamp = new Date().toISOString();
    let ProcessId = '';
    if (cluster.isMaster) {
      ProcessId = process.pid;
    } else if (cluster.isWorker) {
      ProcessId = cluster.worker.id;
    }
    let component = '';
    if (obj && obj.component ) {
      component = obj.component;
    }
    let message = Timestamp + ' ['+ ProcessId + ']'+ ' ['+ component + ']';
      console[level](message, util.format(...dataList));
  }
}

module.exports.writeConsoleLog =  writeConsoleLog;

// choose certain properties of req/res/err to include in log records, pass the rest through
// be extra careful to not throw an error here
// - by inadvertently dereferencing any null/undefined objects
function serializeLogRecord(level, configLevel, obj, text, isTransactionLog, stackTrace) {
  if (configLevel === 'none') {
    return null;
  }
  switch (level) {
    case 'trace': {
      if (configLevel === 'error' || configLevel === 'warn' || configLevel === 'info' || configLevel === 'debug') {
        return null;
      }
      break;
    }
    case 'debug': {
      if (configLevel === 'error' || configLevel === 'warn' || configLevel === 'info') {
        return null;
      }
      break;
    }
    case 'info': {
      if (configLevel === 'error' || configLevel === 'warn') {
        return null;
      }
      break;
    }
    case 'warn': {
      if ( configLevel === 'error' ) {
        return null;
      }
      break;
    }
  }

  const record = {};
  let transactionContextData = {};
  if (typeof obj === 'string') {
    if (text) text = text + ' ' + obj; // append obj to text
    else text = obj; // assign obj to text
  } else if (obj) Object.keys(obj).forEach(function (key) {
    if (key === 'req') {
      const req = obj[key];
      if (req) {
        if ( req.transactionContextData ) {
          transactionContextData = req.transactionContextData;
        } else {
          record.m = req.method;
          record.u = req.url || req.path;
          record.h = (req.headers ? req.headers.host : '');
          if (!record.h && req.agent && req.agent.sockets) {
            let socketdata = Object.keys(req.agent.sockets)[0];
            if ( socketdata ) {
              record.h = socketdata.replace(':',''); // used if req is target request object
            }
            
          }
        }
        
      }
    } else if (key === 'res') {
      const res = obj[key];
      if (res) {
        record.s = res.statusCode;
      }
    } else if (key === 'err') {
      const err = obj[key];
      if (err) {
        record.name = err.name;
        record.message = err.message;
        record.code = err.code;
        record.stack = err.stack;
      }
    } else if (key === 'stats') {
      const stats = obj[key];
      if (stats) {
        Object.keys(stats).forEach(function (key) {
          if (key === 'statusCodes') {
            const codes = stats[key];
            record[key] = '{' + Object.keys(codes).map(function (code) {
              return code + '=' + codes[code];
            }).join(', ') + '}'
          } else {
            record[key] = stats[key];
          }
        });
      }

      const mem = process.memoryUsage();
      record.rss = mem.rss;

      const cpus = os.cpus();
      const userTimes = [];
      cpus.forEach(function (cpu) {
        userTimes.push(cpu.times.user);
      });
      record.cpu = '[' + userTimes.join(', ') + ']';
    } else if (key === 'transactionContextData') {
      transactionContextData = obj[key];
    } {
      record[key] = obj[key];
    }
  });

  if (isTransactionLog) {
    record.transactionContextData = transactionContextData;
    return serializeEventLogRecord(level, record, text, stackTrace);
  }
  const preamble = new Date().toISOString() + ' ';

  if ( level !== 'trace' &&  stackTrace !== true ) {
    delete record.stack;
  }

  let ProcessId = '';
  if (cluster.isMaster) {
      ProcessId = process.pid;
  } else if (cluster.isWorker) {
      ProcessId = cluster.worker.id;
  }

  var message = preamble + level + ' '+ ProcessId + ' ' + (text ? text + ' ' : '') +
    Object.keys(record).map(function (key) {
      return key + '=' + record[key]; // assumes vaules are primitive, no recursion
    }).join(', ') +
    os.EOL;
    
  return message;

}

function statsTimer(statsLogInterval) {
  // periodically log stats, but not if idle (no new requests or responses)

  if (typeof statsLogInterval === 'number' && statsLogInterval > 0) {
    var lastRequests = 0;
    var lastResponses = 0;
    const logTimer = setInterval(function () {
      const statsInfo = stats.getStats();
      if (lastRequests !== statsInfo.requests && lastResponses !== statsInfo.responses) {
        lastRequests = statsInfo.requests;
        lastResponses = statsInfo.responses;
        logger.stats(statsInfo);
      }
    }, statsLogInterval * 1000); // convert seconds to milliseconds
    logTimer.unref(); // don't keep event loop alive just for logging stats
  }
}

const _calculateLogFilePath = (logDir, uid, rotation) => {
  const baseFileName = util.format('edgemicro-%s-%s-%d-api.log', os.hostname(), uid, rotation);
  const logFilePath = path.join(logDir, baseFileName);
  return logFilePath;
};

const isValidIPaddress = (ipaddress) =>
{
 if (/^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(ipaddress))
  {
    return (true)
  }
  return (false)
}

const serializeEventLogRecord = (level, record, text, stackTrace) => {
  const Timestamp = new Date().toISOString();
  const hostname = record.h || record.transactionContextData.host || ''; // by deault print source request hostname, else print from corresponding req object
  let ProcessId = '';
  if (cluster.isMaster) {
    ProcessId = process.pid;
  } else if (cluster.isWorker) {
    ProcessId = cluster.worker.id;
  }
  const Org = process.env.CurrentOrgName;
  const Environment = process.env.CurrentEnvironmentName;
  let url = record.transactionContextData.url; // by deault print source request url
  const APIProxy = url ? url.replace('/','') : '';
  let ClientIp = record.transactionContextData.clientIP || '';
  const ClientId = record.transactionContextData.clientId || '';
  const component = record.component || '';
  let reqMethod = record.m || record.transactionContextData.method || ''; // by deault print source request method, else print from corresponding req object
  let respStatusCode = record.s || '';
  let errMessage = record.message || '';
  let errCode = record.code || '';
  let customMessage =  ( text && text !== undefined ) ? text : '';
  let correlationId = record.transactionContextData.correlation_id || '';
  let timeTaken = record.d || '';
  let errorStack =  record.stack || '';

  let message = Timestamp + ' ['+ level + ']'
  + '['+ hostname +']'
  + '['+ ProcessId +']'
  + '['+ Org +']'
  + '['+ Environment +']'
  + '['+ APIProxy +']'
  + '['+ ClientIp +']'
  + '['+ ClientId +']'
  + '['+ correlationId +']'
  + '['+ component +']'
  + '['+ customMessage +']'
  + '['+ reqMethod +']'
  + '['+ respStatusCode +']'
  + '['+ errMessage +']'
  + '['+ errCode +']'
  + '['+ timeTaken +']'
    +os.EOL;

  if ( level === 'trace' ||  stackTrace === true ) {
    message += errorStack + os.EOL;
  }

  return message;
}

module.exports._calculateLogFilePath = _calculateLogFilePath;
