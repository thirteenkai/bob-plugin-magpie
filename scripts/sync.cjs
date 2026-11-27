'use strict';

const { spawnSync } = require('node:child_process');
const { buildPackage } = require('./build.cjs');

async function main() {
    const args = process.argv.slice(2);
    const noOpen = args.includes('--no-open');
    if (args.some(arg => arg !== '--no-open')) {
        throw new Error('仅支持 --no-open 参数。');
    }

    const { outputPath, modelCount } = await buildPackage({ publicBuild: false });
    console.log('已同步 ' + modelCount + ' 个 Magpie 模型到安装包：' + outputPath);

    if (!noOpen && process.platform === 'darwin') {
        const opened = spawnSync('open', [outputPath], { stdio: 'inherit' });
        if (opened.error || opened.status !== 0) {
            throw new Error('无法自动打开安装包，请手动双击：' + outputPath);
        }
        console.log('已在 Bob 中打开安装包，请在弹窗中确认更新/安装。');
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error(error.type ? error.message : '同步失败：' + error.message);
        process.exitCode = 1;
    });
}

module.exports = { main };
