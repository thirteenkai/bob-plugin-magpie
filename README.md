# Magpie 翻译 · Bob 插件

<img src="src/icon.png" width="80" alt="Magpie 图标">

在 [Bob](https://bobtranslate.com/) 中通过 [Magpie](https://usemagpie.ai/) 翻译文本，复用你在 Magpie 中配置的模型或路由组。支持流式输出、取消请求、简繁中文和自定义翻译要求。

**只需安装 Bob 插件。Magpie 保持运行即可，不需要另装配套插件。** 本项目是第三方插件，与 Bob、Magpie 官方无隶属关系。

[下载最新版](https://github.com/thirteenkai/bob-plugin-magpie/releases/latest) · [反馈问题](https://github.com/thirteenkai/bob-plugin-magpie/issues) · [MIT 许可](LICENSE)

## 安装和使用

1. 保持 Magpie 运行，并确认其中已有可用文本模型。
2. 从 [Releases](https://github.com/thirteenkai/bob-plugin-magpie/releases/latest) 下载 `.bobplugin` 文件，双击后在 Bob 中确认安装。
3. 打开 Bob「设置 / 偏好设置 → 服务 → 文本翻译」，添加并启用「Magpie 翻译」。
4. 地址保持默认，本机网关密钥留空。先把模型字段留空，点击「验证」查看当前模型 ID，也可以打开[本机模型列表](http://127.0.0.1:3425/v1/models?format=text)。
5. 在「模型 ID / 路由组」填写你自己的完整文本模型或路由组 ID，再点击「验证」。之后可使用 Bob 划词翻译、输入翻译，或翻译 Bob 已识别出的截图文字。

需要 Bob 1.8.0 或更高版本。插件只负责文本翻译；截图识别继续使用 Bob 已配置的 OCR 服务。

## 选择和更新模型

公开安装包不携带开发者的个人模型目录。每个人的供应商与路由配置不同，使用时填写自己的完整 ID，例如目录中实际存在的 `供应商/模型名` 或路由组 ID。

**新增或切换模型只需修改 ID，不需要重新安装插件。** 使用路由组时，在 Magpie 中调整该组的成员或路由策略即可，Bob 保留同一个组 ID。

「验证」每次读取网关实时目录，能发现已失效的模型。未填写模型时，提示中会列出前 12 个 ID；更多模型可在 Magpie 或上述模型列表地址查看。

如希望直接下拉选择，可按下方开发说明自行构建：构建脚本从正在运行的 Magpie 读取模型，生成带个人菜单的安装包。**该菜单是构建时的快照，不会自动刷新。** Bob 的公开 API 只支持固定菜单；新增模型仍可使用备用输入框，无需重装。

可添加多个「Magpie 翻译」服务实例，分别使用不同模型。旧版的手动模型字段沿用相同配置键；从个人菜单包切换到通用公开包时，请检查并重新选择手动模式、填写所需模型 ID。

模型选择和切换均由用户决定，插件不会自动选中列表第一项，也不会在失败时自行换模型。若 Magpie 路由组自身配置了故障切换，则按 Magpie 的规则执行。

## 配置项

| 选项 | 用法 |
| --- | --- |
| Magpie 地址 | 默认 `http://127.0.0.1:3425/v1`。也接受网关根地址或完整 `/v1/chat/completions` 地址。 |
| 模型 | 公开包使用自定义模式；本地构建的个人菜单包支持下拉选择。 |
| 模型 ID / 路由组 | 填写网关目录中的完整 ID；个人菜单包中称为「手动模型 ID（备用）」。 |
| 网关密钥 | 本机留空，插件使用 `magpie-bob` 作为应用标识。远程网关填它的网关密钥。 |
| 输出方式 | 默认流式显示；兼容性有问题时可切换为完整返回。 |
| 思考强度 | 默认自动，不发送该参数。手动选择必须是当前模型支持的值，验证按钮会按目录检查。 |
| 补充翻译要求 | 可填术语、语气和风格，例如「使用自然口语，保留产品名」。 |

「验证」只请求 `GET /v1/models`，检查地址、网关访问、模型 ID 及已知的思考强度，不调用模型、不消耗生成额度。验证通过表示配置可访问模型目录，实际模型翻译仍取决于上游服务与额度。

本机请求通常在 Magpie 用量中归为 `bob`。配置远程网关密钥时，由该密钥的权限、预算和 Magpie 规则约束。无需将上游厂商密钥填进 Bob。

## 翻译行为

- 源语言、目标语言跟随 Bob，区分简体中文与繁体中文。
- 保留原文段落、换行与代码标识；默认只返回译文，以纯文本显示，Markdown 标记按原文保留。
- 支持流式显示、取消请求和多个独立请求。
- 独立的模型思考字段不混入译文；开头的 `<think>...</think>` 也会过滤。
- 截断、空输出、网络或鉴权错误会显示中文提示，不把不完整的结果当成翻译成功。
- 翻译最长等待 120 秒。速度和语种质量取决于你选的模型。

## 数据流

插件仅把待翻译文字、翻译指令和所选模型发送到配置的 Magpie 网关，由 Magpie 按现有配置调用上游。不记录原文、密钥或上游错误响应，没有遥测。公开包提供 GitHub `appcast.json`，供 Bob 检查插件版本更新；检查更新不会发送待翻译文字。Magpie 自身的日志、用量和隐私规则仍按其配置执行。

插件不读取 Magpie 的账号文件，不修改 Magpie 配置，不自动安装或启用其他插件，不改动 Bob 现有服务。

## 开发与验证

无需安装 npm 依赖。测试使用 Node.js 18+，打包使用 Python 3 标准库：

```sh
npm test
npm run build:public
npm run build
npm run models
npm run check:gateway
```

`build:public` 离线生成 `dist/public/magpie-1.1.1.bobplugin`，不访问网关、不附带个人模型列表，适合公开发布。

`build` 执行一次 `GET /v1/models`，读取当前全部模型，生成个人菜单包 `dist/magpie-1.1.1.bobplugin`。模型名称和 ID 只写入忽略的 `dist/` 产物；不把个人目录固定到源码中，也不写入网关密钥或账号数据。Magpie 不可访问或目录为空时构建失败，已有包保留。个人菜单包不配置公开更新源，避免更新时丢失个人菜单。

`models` 只读当前模型目录；先构建再运行 `check:gateway`，它使用插件真实验证入口，核对下拉菜单与实时目录、菜单优先级以及空选项提示，只执行 GET 请求，不生成译文。上述脚本使用环境变量 `MAGPIE_URL` 指定其他地址，`MAGPIE_GATEWAY_KEY` 指定远程网关密钥，均不落盘。

安装包包含 `info.json`、`main.js`、`core.js`、`stream.js`、`icon.png` 及两份许可文件，直接位于 ZIP 根目录。构建会回读核验所有文件并生成 SHA-256 校验文件。`src/info.json` 是模板，`dist/` 下的 JSON 是实际打包配置。

测试覆盖 Bob 模拟运行时、本地 HTTP 模拟网关、中文/emoji 流式分块、取消、并发、错误处理、模型配置与公开包隔离。模型目录检查仅证明网关目录可访问，不代表各上游模型均已完成真实翻译测试。

## 许可与致谢

代码采用 [MIT License](LICENSE)。Magpie 图标来自 [yetone/magpie](https://github.com/yetone/magpie)，许可及原作者声明见 [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES)。

## 官方接口依据

- [Magpie 接入应用](https://usemagpie.ai/docs/integrate)：网关、应用标识、模型目录及远程访问。
- [Magpie 插件开发](https://usemagpie.ai/docs/zh/plugins)：用户提供的参考文档。本项目安装在 Bob 内，通过 Magpie 网关接入。
- [Bob 文本翻译插件](https://bobtranslate.com/plugin/quickstart/translate.html)：入口、验证、取消与超时。
- [Bob HTTP 接口](https://bobtranslate.com/plugin/api/http.html)：请求与流式数据。
- [Bob 翻译结果格式](https://bobtranslate.com/plugin/object/translateresult.html)：新版 `content` 与旧版 `toParagraphs` 兼容。
- [Bob 插件打包](https://bobtranslate.com/plugin/quickstart/pack.html)：`.bobplugin` 包格式。
- [Bob 插件配置](https://bobtranslate.com/plugin/quickstart/info.html)：`icon.png` 图标与固定 `menuValues` 菜单。
- [Bob 文件接口](https://bobtranslate.com/plugin/api/file.html)：插件自身目录只读，沙盒目录可读写。

公开版本与更新说明见 [Releases](https://github.com/thirteenkai/bob-plugin-magpie/releases)。
