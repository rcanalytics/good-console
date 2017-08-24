'use strict';

// Load Modules

const Hoek = require('hoek');
const Moment = require('moment');
const Stream = require('stream');
const SafeStringify = require('json-stringify-safe');

const internals = {
    defaults: {
        utc: true,
        separator : '\n'
    }
};

internals.utility = {
    formatOutput(event, settings) {

        let timestamp = Moment(parseInt(event.timestamp, 10));

        if (settings.utc) {
            timestamp = timestamp.utc();
        }

        const output = SafeStringify({
            id : event.id || undefined,
            timestamp,
            tags : event.tags,
            data : event.data
        });

        return `${output}${settings.separator}`;
    },

    formatResponse(event, tags, settings) {

        const response = {
            timestamp: event.timestamp,
            tags,
            data: {
                instance : event.instance,
                method : event.method,
                path : event.path,
                query : event.query || '',
                statusCode : event.statusCode || '',
                responseTimeMs : event.responseTime,
                pid : event.pid
            }
        };

        return internals.utility.formatOutput(response, settings);
    },

    formatOps(event, tags, settings) {

        const memory = Math.round(event.proc.mem.rss / (1024 * 1024));
        const ops = {
            timestamp: event.timestamp,
            tags,
            data: {
                memoryMb : memory,
                uptimeSec : event.proc.uptime,
                load : event.os.load
            }
        };

        return internals.utility.formatOutput(ops, settings);
    },

    formatError(event, tags, settings) {

        const error = {
            timestamp: event.timestamp,
            tags,
            data: {
                message : event.error.message,
                stack : event.error.stack
            }
        };

        return internals.utility.formatOutput(error, settings);
    },

    formatDefault(event, tags, settings) {

        const defaults = {
            timestamp: event.timestamp,
            id: event.id,
            tags,
            data: event.data
        };

        return internals.utility.formatOutput(defaults, settings);
    }
};

class GoodConsole extends Stream.Transform {
    constructor(config) {

        super({ objectMode: true });

        config = config || {};
        this._settings = Hoek.applyToDefaults(internals.defaults, config);
    }

    _transform(data, enc, next) {

        const eventName = data.event;
        let tags = [];

        if (Array.isArray(data.tags)) {
            tags = data.tags.concat([]);
        }
        else if (data.tags) {
            tags = [data.tags];
        }

        tags.unshift(eventName);

        if (eventName === 'error') {
            return next(null, internals.utility.formatError(data, tags, this._settings));
        }

        if (eventName === 'ops') {
            return next(null, internals.utility.formatOps(data, tags, this._settings));
        }

        if (eventName === 'response') {
            return next(null, internals.utility.formatResponse(data, tags, this._settings));
        }

        if (data.data instanceof Error) {
            const error = data.data;

            return next(null, internals.utility.formatError(Object.assign(data, { error }), tags, this._settings));
        }

        if (!data.data) {
            data.data = null;
        }

        return next(null, internals.utility.formatDefault(data, tags, this._settings));
    }
}

module.exports = GoodConsole;
