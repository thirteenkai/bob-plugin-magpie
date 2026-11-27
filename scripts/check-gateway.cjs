'use strict';

// Run Bob's actual validation entry against the configured gateway. GET only.
const { harness } = require('../tests/harness.cjs');
const core = require('../src/core.js');

async function main() {
    const config = core.readConfig({ baseUrl: process.env.MAGPIE_URL, apiKey: process.env.MAGPIE_GATEWAY_KEY }, false);
    let requests = 0;
    let catalog;
    const { plugin, options } = harness({ baseUrl: config.baseUrl, apiKey: config.key }, {
        request(options) {
            if (options.method !== 'GET' || !options.url.endsWith('/models')) throw new Error('Only model reads allowed');
            requests++;
            fetch(options.url, { headers: options.header, signal: AbortSignal.timeout(15000) }).then(async response => {
                const data = await response.json();
                catalog = data;
                options.handler({ response: { statusCode: response.status }, data });
            }).catch(() => options.handler({ error: { message: 'Gateway unavailable' } }));
        },
        streamRequest() { throw new Error('Generation is disabled in this check'); }
    });

    const discovery = await new Promise(resolve => plugin.pluginValidate(resolve));
    if (!catalog || !Array.isArray(catalog.data) || !catalog.data.length) throw new Error('无法读取模型目录。');
    if (discovery.result !== false || discovery.error.type !== 'param') throw new Error('空模型没有正确提示实时目录。');

    // Selecting an ID here is only for a read-only validation; never saved to Bob.
    const model = catalog.data.find(item => typeof item.id === 'string' &&
        (!item.modalities || !Array.isArray(item.modalities.output) || item.modalities.output.includes('text')));
    if (!model) throw new Error('没有可用于验证的文本模型。');
    options.model = model.id;
    const validation = await new Promise(resolve => plugin.pluginValidate(resolve));
    if (!validation.result) throw new Error(validation.error.message);

    options.model = 'nonexistent/invalid-model-id';
    const invalidValidation = await new Promise(resolve => plugin.pluginValidate(resolve));
    if (invalidValidation.result !== false || invalidValidation.error.type !== 'param') {
        throw new Error('无效模型没有被实时目录拦截。');
    }

    console.log('PASS: 实时读取 ' + catalog.data.length + ' 个模型；空模型列举、有效模型验证与无效模型拦截均通过。');
    console.log('仅执行 ' + requests + ' 次 GET /v1/models；未发送生成请求，未固化模型菜单。');
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
