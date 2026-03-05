'use strict';

const assert = require('assert');
const rewire = require('rewire');
const path = require('path');
const fs = require('fs');

const gatewayModule = rewire('../cli/lib/gateway.js');
const Gateway = gatewayModule.__get__('Gateway');

describe('gateway startup resilience', () => {

    it('should start from cache when config download fails', () => {
        const config = {
            edgemicro: {
                port: 8000,
                max_connections: 1024,
            },
            edge_config: {},
            headers: {},
            proxies: []
        };

        const options = {
            org: 'testorg',
            env: 'testenv',
            key: 'testkey',
            secret: 'testsecret',
            configDir: path.join(__dirname, 'fixtures')
        };

        const cachePath = path.join(options.configDir, options.org + '-' + options.env + '-cache-config.yaml');

        // Mock edgeconfig.get to simulate a failure
        const edgeconfigMock = {
            get: (opts, cb) => {
                cb(new Error('config download failed'));
            },
            load: (opts) => {
                return config;
            },
            save: (cfg, p) => {},
            setConsoleLogger: (logger) => {},
            replaceEnvTags: (config) => { return config; }
        };

        // Mock fs.existsSync to simulate cache existence
        const fsMock = {
            existsSync: (p) => {
                if (p === cachePath) {
                    return true;
                }
                return fs.existsSync(p);
            },
            accessSync: (p, mode) => {
                if ( p.endsWith('.sock')) {
                    throw new Error('ENOENT');
                }
                return fs.accessSync(p,mode);
            },
            unlinkSync: (p) => {},
            appendFileSync: (p) => {}
        };

        let reloaderRunCalled = false;
        // Mock reload-cluster
        const reloadClusterMock = (script, opts) => {
            return {
                run: () => {
                    reloaderRunCalled = true;
                },
                terminate: (cb) => {
                    if (cb) cb();
                }
            };
        };

        // Mock gateway.Logging.init
        const loggingMock = {
            init: () => {},
            getLogger: () => { return console; },
            writeConsoleLog: () => {}
        };
        
        const coreMock = {
            Logging: loggingMock,
            AdminServer: class AdminServer {
                start() {}
                setCacheConfig() {}
            }
        };

        let loadedPath = null;
        edgeconfigMock.load = (opts) => {
            loadedPath = opts.source;
            return config;
        };

        gatewayModule.__set__('edgeconfig', edgeconfigMock);
        gatewayModule.__set__('fs', fsMock);
        
        const runPromise = new Promise((resolve) => {
            const originalReloadClusterMock = reloadClusterMock;
            gatewayModule.__set__('reloadCluster', (script, opts) => {
                const reloader = originalReloadClusterMock(script, opts);
                return {
                    run: () => {
                        reloader.run();
                        resolve();
                    },
                    terminate: reloader.terminate
                };
            });
        });

        gatewayModule.__set__('gateway', coreMock);
        gatewayModule.__set__('net', {
            createServer: () => {
                return {
                    listen: () => {},
                    on: () => {}
                }
            },
            Socket: function() {
                return {
                    on: () => {},
                    connect: () => {}
                }
            }
        });

        const gateway = new Gateway();
        gateway.start(options, () => {});

        return runPromise.then(() => {
            assert.strictEqual(reloaderRunCalled, true, 'gateway should have started from cache');
            assert.strictEqual(loadedPath, cachePath, 'should have loaded the correct cache path');
        });

    });

});
