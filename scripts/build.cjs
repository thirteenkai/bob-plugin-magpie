'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.join(__dirname, '..');

function makeInfo(source, { publicBuild = false } = {}) {
    const info = JSON.parse(JSON.stringify(source));
    if (!publicBuild) {
        // Local dev builds omit appcast so upstream releases don't overwrite them.
        delete info.appcast;
    }
    info.options = info.options.filter(item => item.identifier !== 'modelChoice');
    const model = info.options.find(item => item.identifier === 'model');
    if (!model || model.type !== 'text') throw new Error('缺少模型输入框配置。');
    return info;
}

function makePublicInfo(source) {
    return makeInfo(source, { publicBuild: true });
}

async function buildPackage({ publicBuild = false } = {}) {
    const source = JSON.parse(fs.readFileSync(path.join(root, 'src/info.json'), 'utf8'));
    const info = makeInfo(source, { publicBuild });
    const outputDir = publicBuild ? path.join(root, 'dist/public') : path.join(root, 'dist');
    const output = path.join(outputDir, 'info-' + info.version + '.json');
    const packagePath = path.join(outputDir, 'magpie-' + info.version + '.bobplugin');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(info, null, 2) + '\n');
    console.log(publicBuild ? '构建通用公开安装包（离线，实时读取 Magpie 模型目录）。' :
        '构建本地安装包（实时读取 Magpie 模型目录）。');
    const packed = spawnSync('python3', [path.join(__dirname, 'build.py'), output, publicBuild ? 'public' : 'local'], { stdio: 'inherit' });
    if (packed.error || packed.status !== 0) throw new Error('插件打包失败。');
    return { outputPath: packagePath, info };
}

async function main() {
    const publicBuild = process.argv.includes('--public');
    if (process.argv.slice(2).some(arg => arg !== '--public')) throw new Error('仅支持 --public 参数。');
    await buildPackage({ publicBuild });
}

if (require.main === module) {
    main().catch(error => {
        console.error(error.type ? error.message : '构建失败：' + error.message);
        process.exitCode = 1;
    });
}

module.exports = { makeInfo, makePublicInfo, buildPackage };
