'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '../src');
const info = JSON.parse(fs.readFileSync(path.join(root, 'info.json'), 'utf8'));

function signal() {
    const handlers = new Set();
    return {
        subscribe(handler) { handlers.add(handler); return { dispose() { handlers.delete(handler); } }; },
        send() { for (const handler of [...handlers]) handler(); },
        count() { return handlers.size; }
    };
}

function harness(options = {}, http) {
    const requests = [];
    const globals = {
        $option: { ...Object.fromEntries(info.options.map(option => [option.identifier, option.defaultValue])), ...options },
        $info: info,
        $http: http || {
            request(options) { requests.push({ kind: 'normal', ...options }); },
            streamRequest(options) { requests.push({ kind: 'stream', ...options }); }
        }
    };
    const modules = {};
    function load(name) {
        const filename = path.resolve(root, name);
        if (!filename.startsWith(root + path.sep) || !filename.endsWith('.js')) throw new Error('Unexpected module');
        if (modules[filename]) return modules[filename];
        const exports = {};
        modules[filename] = exports;
        // No Node, DOM, fetch, URL, Buffer or TextDecoder exposed to plugin code.
        vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { ...globals, exports, require: load }, { filename, timeout: 3000 });
        return exports;
    }
    return { plugin: load('./main.js'), requests, options: globals.$option };
}

function query(overrides = {}) {
    const completed = [];
    const streamed = [];
    const value = {
        text: 'Hello, world!\n\nKeep `API_ID` unchanged.',
        from: 'auto', to: 'auto', detectFrom: 'en', detectTo: 'zh-Hans',
        cancelSignal: signal(),
        onCompletion(value) { completed.push(value); },
        onStream(value) { streamed.push(value); },
        ...overrides
    };
    return { value, completed, streamed };
}

function chunk(request, text) { request.streamHandler({ text }); }
function event(content, reason = null) {
    return 'data: ' + JSON.stringify({ choices: [{ index: 0, delta: { content }, finish_reason: reason }] }) + '\n\n';
}
function ok(request) { request.handler({ response: { statusCode: 200 } }); }

module.exports = { harness, query, chunk, event, ok, signal };
