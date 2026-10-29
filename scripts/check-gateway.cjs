'use strict';

// Run Bob's actual validation entry against the configured gateway. GET only.
const { harness } = require('../tests/harness.cjs');
const core = require('../src/core.js');
const fs = require('node:fs');
const path = require('node:path');
const { makeInfo } = require('./build.cjs');

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
    if (discovery.result !== false || discovery.error.type !== 'param') throw new Error('空模型没有正确提示选择。');
    // Selecting an ID here is only for a read-only validation; never saved to Bob.
    const model = catalog.data.find(item => typeof item.id === 'string' &&
        (!item.modalities || !Array.isArray(item.modalities.output) || item.modalities.output.includes('text')));
    if (!model) throw new Error('没有可用于验证的文本模型。');
    options.modelChoice = 'model:' + model.id;
    options.model = 'legacy/ignored';
    const validation = await new Promise(resolve => plugin.pluginValidate(resolve));
    if (!validation.result) throw new Error(validation.error.message);
    const version = require('../package.json').version;
    const packagedInfo = JSON.parse(fs.readFileSync(path.join(__dirname, '../dist/info-' + version + '.json'), 'utf8'));
    const generated = makeInfo(require('../src/info.json'), catalog);
    const getMenu = info => info.options.find(item => item.identifier === 'modelChoice').menuValues;
    if (JSON.stringify(getMenu(packagedInfo)) !== JSON.stringify(getMenu(generated))) throw new Error('安装包菜单与当前 Magpie 目录不同，请重新构建。');
    console.log('PASS: ' + catalog.data.length + ' 个模型；安装包菜单与实时目录一致，下拉选择验证通过且优先于旧配置。');
    console.log('仅执行 ' + requests + ' 次 GET /v1/models；未发送翻译请求，未保存模型选择。');
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
