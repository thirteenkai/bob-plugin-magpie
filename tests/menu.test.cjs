'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeInfo, makePublicInfo } = require('../scripts/build.cjs');
const source = require('../src/info.json');
const core = require('../src/core.js');

test('从目录生成全部模型和路由的菜单，精确保留 ID，不预选模型', () => {
    const catalog = { data: [
        { id: 'provider/model-a', magpie_label: 'Model A · 服务商甲' },
        { id: 'group/translation', display_name: '翻译路由' },
        { id: 'image/model', modalities: { output: ['image'] } },
        { id: 'provider/model-a' },
        { id: 'manual' }
    ] };
    const info = makeInfo(source, catalog);
    const menu = info.options.find(option => option.identifier === 'modelChoice');
    assert.equal(menu.defaultValue, '');
    assert.deepEqual(menu.menuValues.map(item => item.value), ['', 'model:provider/model-a', 'model:group/translation', 'model:image/model', 'model:manual', 'manual']);
    assert.match(menu.menuValues[1].title, /服务商甲/);
    assert.match(menu.menuValues[2].title, /翻译路由/);
    for (const choice of menu.menuValues.slice(1, -1)) {
        assert.equal(core.readConfig({ modelChoice: choice.value }, true).model, choice.value.slice(6));
    }
    assert.equal(source.options.find(option => option.identifier === 'modelChoice').menuValues.length, 2);
    assert.equal(info.appcast, undefined);
});

test('公开包不携带本机模型列表，保留更新地址并使用用户填写的模型', () => {
    const personalized = makeInfo(source, { data: [{ id: 'private-provider/private-model', magpie_label: 'private-label' }] });
    personalized.appcast = source.appcast;
    const info = makePublicInfo(personalized);
    assert.doesNotMatch(JSON.stringify(info), /private-provider|private-model|private-label/);
    assert.equal(info.appcast, source.appcast);
    const options = Object.fromEntries(info.options.map(option => [option.identifier, option.defaultValue]));
    options.model = 'user/translator';
    assert.equal(core.readConfig(options, true).model, 'user/translator');
});

test('目录变更后重新构建菜单，不残留旧模型，不复制目录中的其他字段', () => {
    const before = makeInfo(source, { data: [{ id: 'old/model' }] });
    const after = makeInfo(before, { data: [{ id: 'new/model', account: 'private-fixture', apiKey: 'private-fixture' }] });
    const output = JSON.stringify(after);
    assert.match(output, /new\/model/);
    assert.doesNotMatch(output, /old\/model|private-fixture/);
});

test('空目录、无效结构或 ID 不生成误导性的安装包', () => {
    for (const catalog of [null, {}, { data: [] }, { data: [null] }, { data: [{}] }, { data: [{ id: '' }] }, { data: [{ id: ' x/y ' }] }]) {
        assert.throws(() => makeInfo(source, catalog));
    }
});
