'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const core = require('../src/core.js');
const streaming = require('../src/stream.js');
const { harness, query, chunk, event, ok } = require('./harness.cjs');
const plain = value => JSON.parse(JSON.stringify(value));

test('未选择模型时不发请求猜测或自动选中第一项', () => {
    const { plugin, requests } = harness();
    const q = query();
    plugin.translate(q.value);
    assert.equal(requests.length, 0);
    assert.equal(q.completed[0].error.type, 'param');
    assert.match(q.completed[0].error.message, /模型/);
});

test('下拉选择使用精确模型 ID，并优先于旧版手填配置', () => {
    for (const model of ['provider/future-model', 'group/翻译路由', 'manual']) {
        const { plugin, requests } = harness({ modelChoice: 'model:' + model, model: 'old/model' });
        plugin.translate(query().value);
        assert.equal(requests[0].body.model, model);
    }
});

test('手动模式和旧版配置仍有效，错误的菜单值不发送请求', () => {
    assert.equal(core.readConfig({ modelChoice: 'manual', model: 'new/translator' }, true).model, 'new/translator');
    assert.equal(core.readConfig({ model: 'legacy/translator' }, true).model, 'legacy/translator');
    for (const modelChoice of ['manual', 'model:', 'invalid']) {
        const { plugin, requests } = harness({ modelChoice });
        const q = query();
        plugin.translate(q.value);
        assert.equal(requests.length, 0);
        assert.equal(q.completed[0].error.type, 'param');
    }
});

test('根地址、v1、完整接口、IPv6 和代理前缀都正确规范化', () => {
    for (const url of ['http://127.0.0.1:3425', 'http://127.0.0.1:3425/v1/', 'http://127.0.0.1:3425/v1/chat/completions']) {
        assert.equal(core.readConfig({ baseUrl: url }).baseUrl, 'http://127.0.0.1:3425/v1');
    }
    assert.equal(core.readConfig({ baseUrl: 'http://[::1]:3425' }).key, 'magpie-bob');
    assert.equal(core.readConfig({ baseUrl: 'https://gateway.example/proxy', apiKey: 'test-key' }).baseUrl, 'https://gateway.example/proxy/v1');
    for (const url of ['ftp://example.test', 'http://u:p@host', 'http://localhost:99999', 'http://localhost/?key=value', 'http://localhost/#fragment']) {
        assert.throws(() => core.readConfig({ baseUrl: url }), error => error.type === 'param');
    }
    assert.throws(() => core.readConfig({ baseUrl: 'http://192.168.1.2:3425' }), error => error.type === 'secretKey');
});

test('发送精确模型或路由组名，保留原文，使用 Bob 检测语言', () => {
    for (const model of ['provider/new-model', '我的翻译路由']) {
        const { plugin, requests } = harness({ model });
        const q = query();
        plugin.translate(q.value);
        const req = requests[0];
        assert.equal(req.body.model, model);
        assert.equal(req.body.messages[1].content, q.value.text);
        assert.match(req.body.messages[0].content, /英语翻译成简体中文/);
        assert.equal(req.body.reasoning_effort, undefined);
        assert.equal(req.body.temperature, undefined);
        assert.equal(req.header.Authorization, 'Bearer magpie-bob');
        assert.equal(req.cancelSignal, q.value.cancelSignal);
        assert.ok(req.timeout < plugin.pluginTimeoutInterval());
    }
});

test('显式选择语言优先于自动检测，补充要求与原文分开', () => {
    const config = core.readConfig({ model: 'x/y', reasoningEffort: 'low', instructions: '保留产品名' }, true);
    const prepared = core.prepare({ text: 'Test', from: 'fr', detectFrom: 'en', to: 'zh-Hant', detectTo: 'zh-Hans' }, config);
    assert.equal(prepared.body.reasoning_effort, 'low');
    assert.match(prepared.body.messages[0].content, /法语翻译成繁体中文/);
    assert.match(prepared.body.messages[0].content, /保留产品名/);
    assert.throws(() => core.prepare({ text: 'x', detectFrom: 'en', to: 'auto' }, config), e => e.type === 'unsupportedLanguage');
    assert.throws(() => core.prepare({ text: '  ', detectTo: 'en' }, config), e => e.type === 'param');
});

test('SSE 在每个字符处分块仍能处理多事件、CRLF、注释和完成标志', () => {
    const { plugin, requests } = harness({ model: 'x/y' });
    const q = query();
    plugin.translate(q.value);
    const text = ': keepalive\r\n\r\n' + event('你好，').replaceAll('\n', '\r\n') + event('世界！\n\n第二段') + event('', 'stop') + 'data: [DONE]\n\n';
    for (const character of text) chunk(requests[0], character);
    ok(requests[0]);
    assert.equal(q.completed.length, 1);
    assert.equal(q.completed[0].result.content.text, '你好，世界！\n\n第二段');
    assert.equal(q.streamed[0].content.text, '你好，');
    assert.equal(q.streamed.at(-1).content.text, '你好，世界！\n\n第二段');
    assert.equal(q.completed[0].result.toParagraphs.length, 1);
});

test('原始 UTF-8 每字节分块时中文和 emoji 不丢字', () => {
    const { plugin, requests } = harness({ model: 'x/y' });
    const q = query();
    plugin.translate(q.value);
    const text = '\uFEFF' + event('中文🙂 café') + 'data: [DONE]\n\n';
    for (const byte of Buffer.from(text)) requests[0].streamHandler({ rawData: { toByteArray() { return [byte]; } } });
    ok(requests[0]);
    assert.equal(q.completed[0].result.content.text, '中文🙂 café');
    const decoder = streaming.createUTF8Decoder();
    decoder.push([0xe4]);
    assert.throws(() => decoder.finish(), e => /不完整/.test(e.message));
    assert.throws(() => streaming.createUTF8Decoder().push([0xc0, 0x80]), e => e.type === 'api');
});

test('支持多行 data、纯 CR、无末尾空行和 usage 事件', () => {
    const { plugin, requests } = harness({ model: 'x/y' });
    const q = query();
    plugin.translate(q.value);
    chunk(requests[0], 'event: message\rdata: {"choices":\rdata: [{"delta":{"content":"译文"},"finish_reason":"stop"}]}\r\r');
    chunk(requests[0], 'data: {"choices":[],"usage":{"total_tokens":5}}\r\rdata: [DONE]');
    ok(requests[0]);
    assert.equal(q.completed[0].result.content.text, '译文');
});

test('只返回译文，不把独立或跨块 think 思考内容混入译文', () => {
    const { plugin, requests } = harness({ model: 'x/y' });
    const q = query();
    plugin.translate(q.value);
    chunk(requests[0], 'data: {"choices":[{"delta":{"reasoning_content":"内部分析"}}]}\n\n');
    for (const part of ['<thi', 'nk>分析', '</thi', 'nk>\n译', '文']) chunk(requests[0], event(part));
    chunk(requests[0], 'data: [DONE]\n\n');
    ok(requests[0]);
    assert.equal(q.completed[0].result.content.text, '译文');
    assert.ok(q.streamed.every(v => !/分析|think/.test(v.content.text)));
});

test('取消透传到 HTTP，迟到的分块和完成回调不再写入结果', () => {
    const { plugin, requests } = harness({ model: 'x/y' });
    const q = query();
    plugin.translate(q.value);
    chunk(requests[0], event('部分'));
    q.value.cancelSignal.send();
    chunk(requests[0], event('迟到'));
    ok(requests[0]);
    ok(requests[0]);
    assert.equal(q.completed.length, 1);
    assert.match(q.completed[0].error.message, /取消/);
    assert.equal(q.streamed.length, 1);
    assert.equal(q.value.cancelSignal.count(), 0);
});

test('同时翻译的缓冲区互不干扰', () => {
    const { plugin, requests } = harness({ model: 'x/y' });
    const a = query(); const b = query();
    plugin.translate(a.value); plugin.translate(b.value);
    chunk(requests[0], event('甲'));
    chunk(requests[1], event('乙') + 'data: [DONE]\n\n');
    ok(requests[1]);
    chunk(requests[0], event('一') + 'data: [DONE]\n\n');
    ok(requests[0]);
    assert.equal(a.completed[0].result.content.text, '甲一');
    assert.equal(b.completed[0].result.content.text, '乙');
});

test('完整返回与不遵守 stream 的 JSON 网关都可读，保留格式', () => {
    const packet = { choices: [{ message: { content: [{ type: 'text', text: '**译文**\n\n下一段' }] }, finish_reason: 'stop' }] };
    for (const mode of ['on', 'off']) {
        const { plugin, requests } = harness({ model: 'x/y', stream: mode });
        const q = query();
        plugin.translate(q.value);
        if (mode === 'on') { chunk(requests[0], JSON.stringify(packet)); ok(requests[0]); }
        else requests[0].handler({ response: { statusCode: 200 }, data: JSON.stringify(packet) });
        assert.equal(q.completed[0].result.content.text, '**译文**\n\n下一段');
        assert.equal(q.completed[0].result.content.format, 'plain');
        if (mode === 'off') assert.equal(q.streamed.length, 0);
    }
});

test('认证、配额、服务异常和网络错误不泄漏上游响应', () => {
    for (const [status, type] of [[401, 'secretKey'], [403, 'secretKey'], [404, 'api'], [429, 'api'], [500, 'api'], [400, 'api'], [0, 'network']]) {
        const { plugin, requests } = harness({ model: 'x/y', apiKey: 'private-test-value' });
        const q = query();
        plugin.translate(q.value);
        chunk(requests[0], '{"error":{"message":"private-test-value secret source"}}');
        requests[0].handler({ response: { statusCode: status }, error: status ? undefined : { message: 'private-test-value' } });
        assert.equal(q.completed[0].error.type, type);
        assert.doesNotMatch(JSON.stringify(q.completed), /private-test-value|secret source/);
    }
});

test('截断、空输出、内容过滤、工具调用和损坏事件不冒充成功', () => {
    const cases = [
        event('只翻了一半'),
        event('只翻了一半', 'length') + 'data: [DONE]\n\n',
        event('', 'content_filter'),
        event('', 'tool_calls'),
        'data: [DONE]\n\n',
        'data: {broken}\n\n',
        'data: {"error":{"message":"bad"}}\n\n',
        'data: {"choices":[{"delta":{"refusal":"no"}}]}\n\n',
        '<html>Not a gateway</html>'
    ];
    for (const body of cases) {
        const { plugin, requests } = harness({ model: 'x/y' });
        const q = query();
        plugin.translate(q.value);
        chunk(requests[0], body); ok(requests[0]);
        assert.equal(q.completed.length, 1);
        assert.equal(q.completed[0].error.type, 'api', body);
        assert.equal(q.completed[0].result, undefined);
    }
});

test('验证仅 GET 模型目录，检查完整 ID、路由组与支持的思考强度', () => {
    const catalog = { data: [{ id: '任意路由组' }, { id: 'provider/future-model', reasoning_levels: ['low', 'high'] }] };
    for (const [model, effort, expected] of [['任意路由组', 'auto', true], ['provider/future-model', 'low', true], ['', 'auto', false], ['future-model', 'auto', false], ['provider/future-model', 'medium', false]]) {
        const { plugin, requests } = harness({ model, reasoningEffort: effort });
        const completed = [];
        plugin.pluginValidate(value => completed.push(value));
        assert.equal(requests.length, 1);
        assert.equal(requests[0].method, 'GET');
        assert.equal(requests[0].url, 'http://127.0.0.1:3425/v1/models');
        requests[0].handler({ response: { statusCode: 200 }, data: catalog });
        assert.equal(completed[0].result, expected);
        if (!model) assert.match(completed[0].error.message, /provider\/future-model/);
    }
    assert.throws(() => core.validateCatalog({ data: [{ id: 'image', modalities: { output: ['image'] } }] }, { model: 'image', effort: 'auto' }), e => e.type === 'param');
});

test('旧版回调接口可完成翻译，同一请求只回调一次', () => {
    const { plugin, requests } = harness({ model: 'x/y', stream: 'off' });
    const q = query({ onCompletion: undefined });
    plugin.translate(q.value, value => q.completed.push(value));
    const response = { response: { statusCode: 200 }, data: { choices: [{ message: { content: '好' } }] } };
    requests[0].handler(response); requests[0].handler(response);
    assert.equal(q.completed.length, 1);
    assert.deepEqual(plain(q.completed[0].result.toParagraphs), ['好']);
});

test('本地 HTTP 网关端到端模拟：验证、流式和完整返回', async t => {
    const seen = [];
    const server = http.createServer(async (request, response) => {
        const parts = [];
        for await (const part of request) parts.push(part);
        const body = parts.length ? JSON.parse(Buffer.concat(parts).toString()) : undefined;
        seen.push({ method: request.method, url: request.url, auth: request.headers.authorization, body });
        if (request.url === '/v1/models') {
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ data: [{ id: 'test/translator' }] }));
        } else if (body.stream) {
            response.setHeader('Content-Type', 'text/event-stream');
            response.write(Buffer.from(event('你好🙂')).subarray(0, 36));
            setImmediate(() => response.end(Buffer.concat([Buffer.from(event('你好🙂')).subarray(36), Buffer.from(event('', 'stop') + 'data: [DONE]\n\n')])));
        } else {
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ choices: [{ message: { content: '你好🙂' }, finish_reason: 'stop' }] }));
        }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const baseUrl = 'http://127.0.0.1:' + server.address().port;
    const adapter = (stream) => options => {
        const req = http.request(options.url, { method: options.method, headers: options.header }, response => {
            const data = [];
            response.on('data', part => {
                if (stream) options.streamHandler({ rawData: { toByteArray: () => Array.from(part) } });
                else data.push(part);
            });
            response.on('end', () => options.handler({ response: { statusCode: response.statusCode }, data: stream ? undefined : Buffer.concat(data).toString() }));
        });
        req.on('error', error => options.handler({ error }));
        req.end(options.body ? JSON.stringify(options.body) : undefined);
    };
    for (const mode of ['on', 'off']) {
        const { plugin } = harness({ modelChoice: 'model:test/translator', model: 'legacy/ignored', baseUrl, stream: mode }, { request: adapter(false), streamRequest: adapter(true) });
        const validated = await new Promise(resolve => plugin.pluginValidate(resolve));
        assert.equal(validated.result, true);
        const translated = await new Promise(resolve => plugin.translate(query({ onCompletion: resolve }).value));
        assert.equal(translated.result.content.text, '你好🙂');
    }
    assert.equal(seen.length, 4);
    assert.equal(seen[1].url, '/v1/chat/completions');
    assert.equal(seen[1].auth, 'Bearer magpie-bob');
    assert.equal(seen[1].body.model, 'test/translator');
    assert.equal(seen[3].body.stream, false);
});

test('翻译模式支持翻译风格预设与自定义翻译 Prompt 模板', () => {
    const info = require('../src/info.json');
    const promptOption = info.options.find(item => item.identifier === 'translatePrompt');
    assert.equal(promptOption.defaultValue, core.DEFAULT_TRANSLATE_PROMPT);

    for (const [style, expected] of [
        ['formal', /正式/],
        ['casual', /口语化/],
        ['literal', /直译/],
        ['natural', /地道/]
    ]) {
        const config = core.readConfig({ model: 'x/y', mode: 'translate', translationStyle: style }, true);
        const prepared = core.prepare({ text: 'Hello', detectFrom: 'en', detectTo: 'zh-Hans' }, config);
        assert.match(prepared.body.messages[0].content, expected);
    }

    const customSys = core.readConfig({
        model: 'x/y',
        mode: 'translate',
        translatePrompt: '把{{from}}({{fromCode}})译为{{to}}({{toCode}})，仅输出译文。',
        translationStyle: 'literal'
    }, true);
    const sysPrepared = core.prepare({ text: 'Hi', detectFrom: 'en', detectTo: 'ja' }, customSys);
    assert.equal(sysPrepared.body.messages.length, 2);
    assert.equal(sysPrepared.body.messages[0].role, 'system');
    assert.match(sysPrepared.body.messages[0].content, /^把英语\(en\)译为日语\(ja\)，仅输出译文。/);
    assert.match(sysPrepared.body.messages[0].content, /直译/);
    assert.equal(sysPrepared.body.messages[1].content, 'Hi');

    const inlinePrompt = core.readConfig({
        model: 'x/y',
        mode: 'translate',
        translatePrompt: 'Translate from {{from}} to {{to}}:\n{{text}}',
        instructions: '保留专有名词'
    }, true);
    const inlinePrepared = core.prepare({ text: 'Price is $1 & {{to}}', detectFrom: 'en', detectTo: 'zh-Hans' }, inlinePrompt);
    assert.deepEqual(plain(inlinePrepared.body.messages), [
        { role: 'system', content: '补充翻译要求：保留专有名词' },
        { role: 'user', content: 'Translate from 英语 to 简体中文:\nPrice is $1 & {{to}}' }
    ]);

    const emptyFallback = core.readConfig({ model: 'x/y', mode: 'translate', translatePrompt: '   ' }, true);
    const fallbackPrepared = core.prepare({ text: 'Test', detectFrom: 'en', detectTo: 'zh-Hans' }, emptyFallback);
    assert.match(fallbackPrepared.body.messages[0].content, /你是一位专业翻译。将用户消息中的原文从英语翻译成简体中文/);
});

test('润色与提问模式使用对应系统提示且不要求目标语言', () => {
    for (const [mode, expected] of [['polish', /润色/], ['ask', /回答用户的问题/]]) {
        const { plugin, requests } = harness({ model: 'x/y', mode });
        const q = query({ from: 'auto', to: 'auto', detectFrom: undefined, detectTo: undefined, text: 'Explain event loop' });
        plugin.translate(q.value);
        assert.equal(requests.length, 1);
        assert.equal(requests[0].body.messages.length, 2);
        assert.equal(requests[0].body.messages[0].role, 'system');
        assert.match(requests[0].body.messages[0].content, expected);
        assert.deepEqual(plain(requests[0].body.messages[1]), { role: 'user', content: 'Explain event loop' });
    }
});

test('自定义模式支持系统提示与 {{text}} 内联模板，且不破坏特殊字符', () => {
    const sysConfig = core.readConfig({
        model: 'x/y',
        mode: 'custom',
        customPrompt: '请结合目标语言{{to}}（{{toCode}}）总结以下{{from}}内容：'
    }, true);
    const sysPrepared = core.prepare({ text: 'Original body', detectFrom: 'en', detectTo: 'zh-Hans' }, sysConfig);
    assert.deepEqual(plain(sysPrepared.body.messages), [
        { role: 'system', content: '请结合目标语言简体中文（zh-Hans）总结以下英语内容：' },
        { role: 'user', content: 'Original body' }
    ]);

    const inlineConfig = core.readConfig({
        model: 'x/y',
        mode: 'custom',
        customPrompt: 'Analyze ({{from}} -> {{to}}):\n---\n{{text}}\n---'
    }, true);
    const weirdText = 'Cost: $& $1 $$ and literal {{to}} {{text}}';
    const inlinePrepared = core.prepare({ text: weirdText, detectFrom: 'en', detectTo: 'zh-Hans' }, inlineConfig);
    assert.deepEqual(plain(inlinePrepared.body.messages), [
        { role: 'user', content: 'Analyze (英语 -> 简体中文):\n---\n' + weirdText + '\n---' }
    ]);
});

test('自定义模式未填写 Prompt 或无效模式/风格参数时报错且不发生成请求', () => {
    const { plugin, requests } = harness({ model: 'x/y', mode: 'custom', customPrompt: '   ' });
    const q = query();
    plugin.translate(q.value);
    assert.equal(requests.length, 0);
    assert.equal(q.completed[0].error.type, 'param');
    assert.match(q.completed[0].error.message, /自定义 Prompt/);

    const validated = [];
    plugin.pluginValidate(value => validated.push(value));
    assert.equal(requests.length, 1);
    assert.equal(requests[0].method, 'GET');
    requests[0].handler({ response: { statusCode: 200 }, data: { data: [{ id: 'x/y' }] } });
    assert.equal(validated[0].result, false);
    assert.equal(validated[0].error.type, 'param');
    assert.match(validated[0].error.message, /自定义 Prompt/);

    assert.throws(() => core.readConfig({ model: 'x/y', mode: 'unknown' }, true), e => e.type === 'param');
    assert.throws(() => core.readConfig({ model: 'x/y', translationStyle: 'unknown' }, true), e => e.type === 'param');
});
