'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { fetchCatalog } = require('./models.cjs');
const root = path.join(__dirname, '..');

function makeInfo(source, catalog) {
    if (!catalog || !Array.isArray(catalog.data)) throw new Error('模型列表格式不正确。');
    const info = JSON.parse(JSON.stringify(source));
    // Public updates must not silently replace a user's tailored model menu.
    delete info.appcast;
    const option = info.options.find(item => item.identifier === 'modelChoice');
    if (!option || option.type !== 'menu') throw new Error('缺少模型菜单配置。');
    const seen = new Set();
    const values = [];
    for (const model of catalog.data) {
        if (!model || typeof model.id !== 'string' || !model.id.trim() || model.id !== model.id.trim()) {
            throw new Error('模型目录包含无效 ID，未生成安装包。');
        }
        if (seen.has(model.id)) continue;
        seen.add(model.id);
        const name = [model.magpie_label, model.display_name].find(value => typeof value === 'string' && value.trim());
        values.push({ title: name && name !== model.id ? name + ' · ' + model.id : model.id, value: 'model:' + model.id });
    }
    if (!values.length) throw new Error('Magpie 当前没有可用模型，未生成安装包。');
    option.menuValues = [
        { title: '请选择 Magpie 模型', value: '' },
        ...values,
        { title: '手动输入模型 ID（备用）', value: 'manual' }
    ];
    option.defaultValue = '';
    option.desc = '已从 Magpie 读取 ' + values.length + ' 个模型。列表随安装包更新；新增模型后需刷新安装包，或使用手动输入。';
    return info;
}

function makePublicInfo(source) {
    const info = JSON.parse(JSON.stringify(source));
    info.summary = '通过 Magpie 网关翻译，自由配置模型或路由组，支持流式输出。';
    const menu = info.options.find(item => item.identifier === 'modelChoice');
    menu.defaultValue = 'manual';
    menu.menuValues = [{ title: '自定义模型或路由组', value: 'manual' }];
    menu.desc = '公开安装包适用于各自的 Magpie 配置；在下方填写完整模型 ID。';
    const model = info.options.find(item => item.identifier === 'model');
    model.title = '模型 ID / 路由组';
    model.desc = '填写 Magpie 的完整模型或路由组 ID。留空点击验证可查看当前目录；新增模型后直接修改此项即可。';
    model.textConfig.placeholderText = '填写自己的 Magpie 模型 ID';
    return info;
}

async function main() {
    const publicBuild = process.argv.includes('--public');
    if (process.argv.slice(2).some(arg => arg !== '--public')) throw new Error('仅支持 --public 参数。');
    const source = JSON.parse(fs.readFileSync(path.join(root, 'src/info.json'), 'utf8'));
    // The public release is offline and never includes the developer's catalog.
    const info = publicBuild ? makePublicInfo(source) : makeInfo(source, await fetchCatalog());
    const outputDir = publicBuild ? path.join(root, 'dist/public') : path.join(root, 'dist');
    const output = path.join(outputDir, 'info-' + info.version + '.json');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(info, null, 2) + '\n');
    console.log(publicBuild ? '构建通用公开安装包，不读取本机模型目录。' :
        '从 Magpie 读取 ' + (info.options.find(item => item.identifier === 'modelChoice').menuValues.length - 2) + ' 个模型，生成下拉菜单。');
    const packed = spawnSync('python3', [path.join(__dirname, 'build.py'), output, publicBuild ? 'public' : 'local'], { stdio: 'inherit' });
    if (packed.error || packed.status !== 0) throw new Error('插件打包失败。');
}

if (require.main === module) {
    main().catch(error => {
        console.error(error.type ? error.message : '构建失败：' + error.message);
        process.exitCode = 1;
    });
}

module.exports = { makeInfo, makePublicInfo };
