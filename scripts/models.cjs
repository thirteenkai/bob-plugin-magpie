'use strict';

const core = require('../src/core.js');

async function fetchCatalog() {
    const config = core.readConfig({
        baseUrl: process.env.MAGPIE_URL,
        apiKey: process.env.MAGPIE_GATEWAY_KEY
    }, false);
    const response = await fetch(config.baseUrl + '/models', {
        headers: core.headers(config), signal: AbortSignal.timeout(15000)
    });
    const failure = core.responseError({ response: { statusCode: response.status } });
    if (failure) throw failure;
    const catalog = await response.json();
    if (!catalog || !Array.isArray(catalog.data)) throw new Error('模型列表格式不正确。');
    return catalog;
}

async function main() {
    const catalog = await fetchCatalog();
    for (const model of catalog.data) {
        if (typeof model.id === 'string') console.log(model.id);
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error(error.type ? error.message : '无法读取模型列表，请检查 Magpie 地址和运行状态。');
        process.exitCode = 1;
    });
}

module.exports = { fetchCatalog };
