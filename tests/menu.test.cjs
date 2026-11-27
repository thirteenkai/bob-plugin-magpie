'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeInfo, makePublicInfo } = require('../scripts/build.cjs');
const source = require('../src/info.json');
const core = require('../src/core.js');

test('安装包不固化静态模型菜单，保留纯文本模型输入与实时目录校验', () => {
    const localInfo = makeInfo(source);
    const publicInfo = makePublicInfo(source);
    for (const info of [source, localInfo, publicInfo]) {
        assert.equal(info.options.some(option => option.identifier === 'modelChoice'), false);
        const model = info.options.find(option => option.identifier === 'model');
        assert.equal(model.type, 'text');
        assert.equal(model.defaultValue, '');
    }
    assert.equal(localInfo.appcast, undefined);
    assert.equal(publicInfo.appcast, source.appcast);

    const options = Object.fromEntries(publicInfo.options.map(option => [option.identifier, option.defaultValue]));
    options.model = 'user/translator';
    assert.equal(core.readConfig(options, true).model, 'user/translator');
});

test('打包配置保留工作模式、翻译风格和 Prompt 选项', () => {
    const localInfo = makeInfo(source);
    const publicInfo = makePublicInfo(source);
    for (const info of [localInfo, publicInfo]) {
        const ids = info.options.map(option => option.identifier);
        for (const required of ['mode', 'translationStyle', 'translatePrompt', 'customPrompt']) {
            assert.ok(ids.includes(required), '缺少选项：' + required);
        }
    }
});
