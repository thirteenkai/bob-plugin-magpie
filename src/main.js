'use strict';

var core = require('./core.js');
var streaming = require('./stream.js');

function supportLanguages() {
    return Object.keys(core.languages);
}

function pluginTimeoutInterval() {
    return 120;
}

function safeError(value) {
    // Never echo upstream bodies, credentials, source text or native debug dumps.
    if (value && ['param', 'unsupportedLanguage', 'secretKey', 'network', 'api'].indexOf(value.type) >= 0 && typeof value.message === 'string') return value;
    return core.error('api', '插件处理请求失败，请检查配置后重试。');
}

function resultFor(prepared, text) {
    return {
        from: prepared.from,
        to: prepared.to,
        content: { format: 'plain', text: text },
        toParagraphs: [text] // Bob < 1.21; keep the original paragraph structure.
    };
}

function requestHeaders(config) {
    return core.headers(config, typeof $info !== 'undefined' ? $info.version : '1.1.1');
}

function translate(query, completion) {
    var callback = query && query.onCompletion || completion;
    var finished = false;
    var subscription;
    function finish(value) {
        if (finished) return;
        finished = true;
        if (subscription) subscription.dispose();
        if (typeof callback === 'function') callback(value);
    }
    try {
        var config = core.readConfig($option, true);
        var prepared = core.prepare(query, config);
        if (query.cancelSignal && typeof query.cancelSignal.subscribe === 'function') {
            subscription = query.cancelSignal.subscribe(function () {
                finish({ error: core.error('network', '翻译已取消。') });
            });
        }
        var accumulator = streaming.createAccumulator(function (text) {
            if (!finished && config.stream && typeof query.onStream === 'function') query.onStream(resultFor(prepared, text));
        });
        var options = {
            method: 'POST', url: config.baseUrl + '/chat/completions',
            header: requestHeaders(config), body: prepared.body,
            timeout: 110, cancelSignal: query.cancelSignal
        };
        if (config.stream) {
            var reader = streaming.createReader(accumulator.accept);
            var decoder = streaming.createUTF8Decoder();
            var parseError;
            options.streamHandler = function (chunk) {
                if (finished || parseError) return;
                try {
                    var text = chunk.rawData && typeof chunk.rawData.toByteArray === 'function' ?
                        decoder.push(chunk.rawData.toByteArray()) : chunk.text;
                    if (typeof text === 'string') reader.push(text);
                } catch (error) {
                    // Wait for the HTTP status so a 401 JSON body remains an auth error.
                    parseError = safeError(error);
                }
            };
            options.handler = function (response) {
                if (finished) return;
                try {
                    var failure = core.responseError(response);
                    if (failure) throw failure;
                    if (parseError) throw parseError;
                    decoder.finish();
                    var done = reader.finish();
                    finish({ result: resultFor(prepared, accumulator.finish(done)) });
                } catch (error) { finish({ error: safeError(error) }); }
            };
            $http.streamRequest(options);
        } else {
            options.handler = function (response) {
                if (finished) return;
                try {
                    var failure = core.responseError(response);
                    if (failure) throw failure;
                    var packet = core.parseJSON(response.data);
                    if (!packet) throw core.error('api', '网关没有返回有效的翻译数据。');
                    accumulator.accept(packet, true);
                    finish({ result: resultFor(prepared, accumulator.finish(true)) });
                } catch (error) { finish({ error: safeError(error) }); }
            };
            $http.request(options);
        }
    } catch (error) { finish({ error: safeError(error) }); }
}

function pluginValidate(completion) {
    var finished = false;
    function finish(value) {
        if (finished) return;
        finished = true;
        completion(value);
    }
    try {
        var config = core.readConfig($option, false);
        $http.request({
            method: 'GET', url: config.baseUrl + '/models',
            header: requestHeaders(config), timeout: 15,
            handler: function (response) {
                try {
                    var failure = core.responseError(response);
                    if (failure) throw failure;
                    core.validateCatalog(response.data, config);
                    finish({ result: true });
                } catch (error) { finish({ result: false, error: safeError(error) }); }
            }
        });
    } catch (error) { finish({ result: false, error: safeError(error) }); }
}

exports.supportLanguages = supportLanguages;
exports.pluginTimeoutInterval = pluginTimeoutInterval;
exports.translate = translate;
exports.pluginValidate = pluginValidate;
