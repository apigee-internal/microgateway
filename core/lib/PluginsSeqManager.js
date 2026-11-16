const debug = require('debug')('plugins-seq-manager')
const path = require('path'); // Add path module for pattern matching

const METRICS = 'metrics';
const ANALYTICS = 'analytics';
const AMBIGUOUS_PATH_REGEX = /(?:^|\/)\.\.?(?:\/|;|$)/;

class PluginsSeqManager {

    constructor(config, plugins) {
        this.plugins = plugins;
        this.gloabalPostflowPlugins = this.getPostflowPluginSequence(this.plugins);
        this.config = config;
        this.urlPluginsCache = new Map();
        this.defaultPlugins = plugins.filter(p => p.id === 'analytics' || p.id === 'metrics');
        this.uniqueUrls = new Set();
        this.patternCache = new Map(); // New: Cache for URL patterns

        if (this.config.edgemicro.plugins && this.config.edgemicro.plugins.disableExcUrlsCache !== true) {
            debug('Loading all plugins exclude urls in memory');
            this.loadAllUrls();
        } else {
            if (this.config.edgemicro.plugins && this.config.edgemicro.plugins.excludeUrls) {
                this.config.edgemicro.plugins.excludeUrls.split(',').forEach(url => this.uniqueUrls.add(this.normalizeUrl(url)))
            }
            this.plugins.forEach(p => {
                if (p.id !== 'analytics' && p.id !== 'metrics' && this.config[p.id] && this.config[p.id].excludeUrls) {
                    this.config[p.id].excludeUrls.split(',').forEach(url => this.uniqueUrls.add(this.normalizeUrl(url)));
                }
            });
            debug('Unique exclude urls', Array.from(this.uniqueUrls));
        }
    }

    // New: Helper function to normalize URLs (handle patterns and query params)
    normalizeUrl(url) {
        // Remove whitespace
        url = url.trim();
        // Store the original URL pattern or remove query parameters for non-pattern URLs
        return url;
    }

    // New: Check if URL matches a pattern
    matchesPattern(testUrl, pattern) {
        const rawBaseUrl = testUrl.split(/[?#]/)[0];
        if (/^(?:[a-zA-Z][a-zA-Z0-9+.-]*:)?[\\/]{2}/.test(rawBaseUrl)) {
            return false;
        }
        const baseTestUrl = rawBaseUrl.replace(/[\\/]+/g, '/');

        // Fail closed on dot-segments across /, \, ;, or their percent-encoded forms
        // so security plugins are never skipped on ambiguous traversal URLs.
        const decodedTestUrl = baseTestUrl
            .replace(/%2e/gi, '.')
            .replace(/%2f|%5c/gi, '/')
            .replace(/%3b/gi, ';');
        if (AMBIGUOUS_PATH_REGEX.test(decodedTestUrl)) {
            return false;
        }

        // Handle wildcard pattern like /hello/*
        if (pattern.includes('*')) {
            // Convert wildcard to regex pattern
            let regexPattern = pattern
                .replace(/[-\/\\^$+?.()|[\]{}]/g, '\\$&') // Escape regex special chars except *
                .replace(/\*/g, '.*'); // Replace * with .*

            const regex = new RegExp(`^${regexPattern}$`);

            // For URL patterns, only match the base path, not query params
            return regex.test(baseTestUrl);
        } else {
            // For exact matches, compare base URLs without query parameters
            const basePattern = pattern.split('?')[0];
            return basePattern === baseTestUrl;
        }
    }

    loadAllUrls() {
        // load global excludeUrls
        if (this.config.edgemicro.plugins && this.config.edgemicro.plugins.excludeUrls) {
            this.config.edgemicro.plugins.excludeUrls.split(',').forEach(url => {
                url = url.trim();
                this.urlPluginsCache.set(url, {
                    plugins: this.defaultPlugins,
                    postflowPlugins: this.defaultPlugins
                });
            })
        }
        // load urls from the plugins which are enabled in sequence. 
        this.plugins.forEach(p => {
            if (p.id !== 'analytics' && p.id !== 'metrics' && this.config[p.id]) {
                let excludeUrls = null;
                if (this.config[p.id].excludeUrls) {
                    excludeUrls = this.config[p.id].excludeUrls;
                } else if (p.id === 'quota' && this.config['quotas'] && this.config['quotas'].excludeUrls) {
                    excludeUrls = this.config['quotas'].excludeUrls;
                }
                if (excludeUrls) {
                    excludeUrls.split(',').forEach(url => {
                        url = url.trim();
                        if (!this.urlPluginsCache.has(url)) {
                            // skip this plugin
                            const pluginSequence = this.plugins.filter(plgn => plgn.id !== p.id)
                            this.urlPluginsCache.set(url, {
                                plugins: pluginSequence,
                                postflowPlugins: this.getPostflowPluginSequence(pluginSequence, url)
                            });
                        } else {
                            let value = this.urlPluginsCache.get(url);
                            value.plugins = value.plugins.filter(plgn => plgn.id !== p.id)
                            value.postflowPlugins = this.getPostflowPluginSequence(value.plugins, url)
                            this.urlPluginsCache.set(url, value);
                        }
                    }
                    );
                }
            }
        });
        debug('Total urls loaded: %d', this.urlPluginsCache.size);
        for (let [url, value] of this.urlPluginsCache) {
            debug('url: %s, plugins:', url, value.plugins.map(p => p.id));
        }
    }

    setPluginSequence(sourceRequest) {
        let pluginsObj = this.getPluginSequence(sourceRequest.url);
        sourceRequest.preflowPluginSequence = pluginsObj.plugins;
        sourceRequest.postflowPluginSequence = pluginsObj.postflowPlugins;
    }

    getPostflowPluginSequence(plugins, url) {
        // calculate the postflow sequence
        let pluginsReversed = plugins.slice().reverse();
        if (pluginsReversed && pluginsReversed.length >= 2 &&
            pluginsReversed[pluginsReversed.length - 1].id === ANALYTICS &&
            pluginsReversed[pluginsReversed.length - 2].id === METRICS) {

            let temp = pluginsReversed[pluginsReversed.length - 1];
            //swap position of metrics with analytics plugin.
            pluginsReversed[pluginsReversed.length - 1] = pluginsReversed[pluginsReversed.length - 2];
            pluginsReversed[pluginsReversed.length - 2] = temp;
        }
        if (url) {
            debug('preflow plugin sequence for url:' + url, plugins.map(p => p.id));
            debug('postflow plugin sequence for url:' + url, pluginsReversed.map(p => p.id));
        } else {
            debug('preflow plugin sequence', plugins.map(p => p.id));
            debug('postflow plugin sequence', pluginsReversed.map(p => p.id));
        }
        return pluginsReversed;
    }

    getPluginSequence(url) {
        // First check exact match in cache
        if (this.urlPluginsCache.has(url)) {
            return this.urlPluginsCache.get(url);
        }

        // Check if we have already processed this pattern-based URL
        if (this.patternCache.has(url)) {
            return this.patternCache.get(url);
        }

        // Check if URL matches any pattern in urlPluginsCache
        for (let [pattern, value] of this.urlPluginsCache) {
            if (this.matchesPattern(url, pattern)) {
                // Cache this result for future lookups
                this.patternCache.set(url, value);
                return value;
            }
        }

        // Check if URL is in uniqueUrls or matches any pattern there
        for (let pattern of this.uniqueUrls) {
            if (this.matchesPattern(url, pattern)) {
                // URL is in exclude list, now determine which plugins should run

                // Check if present in global exclude list
                if (this.config.edgemicro.plugins && this.config.edgemicro.plugins.excludeUrls) {
                    const globalExcludes = this.config.edgemicro.plugins.excludeUrls.split(',');

                    for (let globalPattern of globalExcludes) {
                        globalPattern = globalPattern.trim();
                        if (this.matchesPattern(url, globalPattern)) {
                            const result = {
                                plugins: this.defaultPlugins,
                                postflowPlugins: this.defaultPlugins
                            };
                            // Cache for future lookups
                            this.patternCache.set(url, result);
                            return result;
                        }
                    }
                }

                // Build custom plugin sequence for this URL
                let urlPlugins = [...this.defaultPlugins];

                this.plugins.forEach(p => {
                    if (p.id === 'quota') {
                        // Special handling for quota plugin
                        if (!this.config['quotas'] || !this.config['quotas'].excludeUrls) {
                            urlPlugins.push(p);
                        } else {
                            // Check if URL matches any quota exclude pattern
                            let exclude = false;
                            for (let quotaPattern of this.config['quotas'].excludeUrls.split(',')) {
                                quotaPattern = quotaPattern.trim();
                                if (this.matchesPattern(url, quotaPattern)) {
                                    exclude = true;
                                    break;
                                }
                            }
                            if (!exclude) {
                                urlPlugins.push(p);
                            }
                        }
                    } else if (p.id !== 'analytics' && p.id !== 'metrics') {
                        // Handling for regular plugins
                        if (!this.config[p.id] || !this.config[p.id].excludeUrls) {
                            urlPlugins.push(p);
                        } else {
                            // Check if URL matches any plugin exclude pattern
                            let exclude = false;
                            for (let pluginPattern of this.config[p.id].excludeUrls.split(',')) {
                                pluginPattern = pluginPattern.trim();
                                if (this.matchesPattern(url, pluginPattern)) {
                                    exclude = true;
                                    break;
                                }
                            }
                            if (!exclude) {
                                urlPlugins.push(p);
                            }
                        }
                    }
                });

                const result = {
                    plugins: urlPlugins,
                    postflowPlugins: this.getPostflowPluginSequence(urlPlugins, url)
                };

                // Cache for future lookups
                this.patternCache.set(url, result);
                return result;
            }
        }

        // Default: use all plugins
        return {
            plugins: this.plugins,
            postflowPlugins: this.gloabalPostflowPlugins
        }
    }
}

module.exports = PluginsSeqManager;