
'use strict';

const fs = require('fs');
const mkdir = require('mkdirp');
const os = require('os');
const path = require('path');
const util = require('util');
const cluster = require('cluster')
const writeConsoleLog = require('microgateway-core').Logging.writeConsoleLog;

const CONSOLE_LOG_TAG = 'microgateway plugin-logger';

// using a WriteStream here causes excessive memory growth under high load (with node v0.12.6, jul 2015)
var pluginlogFileFd;
var pluginlogFilePath;
var pluginLogFailWarn = false;
var writeLogInProgress = false;
var logRecords = [];
var logoffset = 0;
const pluginLogDir = '/var/tmp';

// create differnent file for plugins logs
const writePluginLogToFile = function (record, pluginName, workerId) {
    if(!record) return;
    try {
        const Timestamp = new Date().toISOString();
        record = Timestamp+' '+process.pid+' '+workerId+' '+JSON.stringify(record)+os.EOL;
        let pluginlogFilePathNew = _calculatePluginLogFilePath(pluginLogDir, pluginName);
        if( !pluginlogFilePath || pluginlogFilePath !== pluginlogFilePathNew ) {
            pluginlogFilePath = pluginlogFilePathNew;
            pluginlogFileFd = fs.openSync(pluginlogFilePath, 'a', 0o0600);
        }
        if (record) logRecords.push(record);
        if (writeLogInProgress || (logRecords.length === 0)) {
            return record;
        }

        writeLogInProgress = true;
        const buffer = logRecords.join('');
        logRecords = [];

        fs.write(pluginlogFileFd, buffer, logoffset, 'utf8', function (err, written) {
            writeLogInProgress = false;

            if (err) {
                if (!pluginLogFailWarn) {
                    // print warning once, dumping every failure to console would overwhelm the console
                    writeConsoleLog('warn', { component: CONSOLE_LOG_TAG }, 'error writing log', err);
                    pluginLogFailWarn = true;
                }
            } else {
                logoffset += written;
            }
            if (logRecords.length > 0) {
                process.nextTick(function () {
                    writePluginLogToFile();
                });
            }
        });
        return buffer;
    } catch (e) {
        writeConsoleLog('warn', { component: CONSOLE_LOG_TAG }, 'error writing plugin logger', e);
    }
}

const _calculatePluginLogFilePath = (pluginLogDir, pluginName) => {
    var d=new Date()
    var logDate = d.getHours()+'-'+d.getDate()+'-'+d.getMonth()+'-'+d.getFullYear();
    const baseFileName = util.format('edgemicro-%s-%s-%s.log', os.hostname(), pluginName, logDate);
    const logFilePath = path.join(pluginLogDir, baseFileName);
    return logFilePath;
};


module.exports.writePluginLogToFile = writePluginLogToFile;