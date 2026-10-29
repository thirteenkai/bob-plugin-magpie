'use strict';

var core = require('./core.js');
var MAX_BUFFER = 2 * 1024 * 1024;

// Bob may split a UTF-8 character across rawData callbacks; no TextDecoder in JSC.
function createUTF8Decoder() {
    var pending = [];
    return {
        push: function (bytes) {
            var input = pending.concat(bytes);
            var result = [];
            var i = 0;
            while (i < input.length) {
                var first = input[i];
                var length = first < 128 ? 1 : first >= 194 && first <= 223 ? 2 :
                    first >= 224 && first <= 239 ? 3 : first >= 240 && first <= 244 ? 4 : 0;
                if (!length) throw core.error('api', '网关返回了无效的 UTF-8 数据。');
                if (i + length > input.length) break;
                var code = first & (length === 1 ? 127 : length === 2 ? 31 : length === 3 ? 15 : 7);
                for (var j = 1; j < length; j++) {
                    var next = input[i + j];
                    if ((next & 192) !== 128) throw core.error('api', '网关返回了无效的 UTF-8 数据。');
                    code = (code << 6) | (next & 63);
                }
                if ((length === 2 && code < 128) || (length === 3 && code < 2048) ||
                    (length === 4 && code < 65536) || code > 1114111 || (code >= 55296 && code <= 57343)) {
                    throw core.error('api', '网关返回了无效的 UTF-8 数据。');
                }
                if (code <= 65535) result.push(String.fromCharCode(code));
                else {
                    code -= 65536;
                    result.push(String.fromCharCode(55296 + (code >> 10), 56320 + (code & 1023)));
                }
                i += length;
            }
            pending = input.slice(i);
            return result.join('');
        },
        finish: function () {
            if (pending.length) throw core.error('api', '流式回复中途断开，收到了不完整的字符，请重试。');
        }
    };
}

function createReader(onPacket) {
    var buffer = '';
    var dataLines = [];
    var eventSize = 0;
    var mode = '';
    var done = false;

    function dispatch() {
        if (!dataLines.length) return;
        var payload = dataLines.join('\n');
        dataLines = [];
        eventSize = 0;
        if (done || !payload.trim()) return;
        if (payload.trim() === '[DONE]') { done = true; return; }
        var packet = core.parseJSON(payload);
        if (!packet) throw core.error('api', '无法解析 Magpie 的流式回复，请尝试“完整返回”。');
        onPacket(packet, false);
    }

    function line(value) {
        if (value === '') dispatch();
        else if (value.indexOf('data:') === 0) {
            var data = value.slice(5).replace(/^ /, '');
            eventSize += data.length;
            if (eventSize > MAX_BUFFER) throw core.error('api', '网关返回的单条事件过大。');
            dataLines.push(data);
        }
        // Comments, event, retry and id fields are transport metadata.
    }

    function drain(final) {
        var start = 0;
        for (var i = 0; i < buffer.length; i++) {
            var ch = buffer.charAt(i);
            if (ch !== '\r' && ch !== '\n') continue;
            if (ch === '\r' && i === buffer.length - 1 && !final) break;
            line(buffer.slice(start, i));
            if (ch === '\r' && buffer.charAt(i + 1) === '\n') i++;
            start = i + 1;
        }
        buffer = buffer.slice(start);
        if (final && buffer) { line(buffer); buffer = ''; }
    }

    return {
        push: function (chunk) {
            if (done) return;
            buffer += chunk;
            if (!mode) {
                buffer = buffer.replace(/^\uFEFF/, '');
                if (!buffer.trim()) return;
                mode = buffer.trim().charAt(0) === '{' ? 'json' : 'sse';
            }
            if (mode === 'sse') drain(false);
            if (buffer.length > MAX_BUFFER) throw core.error('api', '网关回复过大或格式不正确。');
        },
        finish: function () {
            if (mode === 'json') {
                var packet = core.parseJSON(buffer);
                if (!packet) throw core.error('api', '网关返回了无法解析的 JSON。');
                onPacket(packet, true);
                done = true;
            } else {
                drain(true);
                dispatch();
            }
            return done;
        }
    };
}

// Hide only leading reasoning blocks, including partial tags across deltas.
function visibleText(raw) {
    var rest = raw;
    while (true) {
        var trimmed = rest.replace(/^\s+/, '');
        if (trimmed && '<think>'.indexOf(trimmed) === 0) return '';
        if (trimmed.indexOf('<think>') !== 0) return rest;
        var end = trimmed.indexOf('</think>');
        if (end < 0) return '';
        rest = trimmed.slice(end + 8).replace(/^\s+/, '');
    }
}

function createAccumulator(onChange) {
    var raw = '';
    var last = '';
    var finishReason = '';
    var receivedFullMessage = false;
    return {
        accept: function (packet, full) {
            if (packet.error) throw core.error('api', 'Magpie 或上游模型返回错误，请在 Magpie 中检查该模型、额度与配置。');
            var choices = Array.isArray(packet.choices) ? packet.choices : [];
            var choice = choices.filter(function (item) { return item && (item.index === 0 || item.index === undefined); })[0];
            if (!choice) return;
            var message = full ? choice.message : choice.delta;
            if (message && message.refusal) throw core.error('api', '模型拒绝了这次翻译，请调整原文或更换模型。');
            if (message) {
                var content = core.contentText(message.content);
                if (full) { raw = content; receivedFullMessage = true; }
                else raw += content;
            }
            if (raw.length > MAX_BUFFER) throw core.error('api', '译文过长，请分段翻译。');
            if (choice.finish_reason) finishReason = choice.finish_reason;
            if (finishReason === 'length') throw core.error('api', '模型输出达到长度上限，译文不完整，请分段翻译或调整 Magpie 的模型设置。');
            if (finishReason === 'content_filter') throw core.error('api', '模型未完成翻译（内容过滤）。');
            if (finishReason === 'tool_calls' || finishReason === 'function_call') throw core.error('api', '模型返回了工具调用，未完成翻译，请换用文本模型。');
            var visible = visibleText(raw);
            if (visible && visible !== last) { last = visible; onChange(visible); }
        },
        finish: function (done) {
            if (!done && !finishReason && !receivedFullMessage) throw core.error('api', '流式回复中途断开，译文可能不完整，请重试。');
            var visible = visibleText(raw);
            if (!visible.trim()) throw core.error('api', '模型没有返回译文，请检查模型类型，或降低思考强度后重试。');
            return visible;
        }
    };
}

exports.createUTF8Decoder = createUTF8Decoder;
exports.createReader = createReader;
exports.createAccumulator = createAccumulator;
