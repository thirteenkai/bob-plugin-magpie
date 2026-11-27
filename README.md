# Magpie · Bob 插件

<img src="src/icon.png" width="80" alt="Magpie 图标">

在 [Bob](https://bobtranslate.com/) 中通过 [Magpie](https://usemagpie.ai/) 调用 AI，复用你在 Magpie 中配置的模型或路由组。支持**翻译、润色、提问、自定义 Prompt** 四种工作模式，支持自定义翻译 Prompt、翻译风格、流式输出、取消请求和简繁中文。

**只需安装 Bob 插件。Magpie 保持运行即可，不需要另装配套插件。** 本项目是第三方插件，与 Bob、Magpie 官方无隶属关系。

[下载最新版](https://github.com/thirteenkai/bob-plugin-magpie/releases/latest) · [反馈问题](https://github.com/thirteenkai/bob-plugin-magpie/issues) · [MIT 许可](LICENSE)

## 安装和使用

1. 保持 Magpie 运行，并确认其中已有可用文本模型。
2. 从 [Releases](https://github.com/thirteenkai/bob-plugin-magpie/releases/latest) 下载 `.bobplugin` 文件（或本地运行 `npm run build` 生成），双击后在 Bob 中确认安装。
3. 打开 Bob「设置 / 偏好设置 → 服务 → 文本翻译」，添加并启用「Magpie」。
4. 地址保持默认，本机网关密钥留空。先把「模型 ID / 路由组」留空，点击「验证」实时请求 `GET /v1/models` 查看当前可用模型列表，也可以打开[本机模型列表](http://127.0.0.1:3425/v1/models?format=text)或运行 `npm run models`。
5. 在「模型 ID / 路由组」填写你自己的完整模型或路由组 ID，再点击「验证」。之后即可使用 Bob 划词、输入或截图 OCR 后的文本处理。

需要 Bob 1.8.0 或更高版本。插件只负责文本请求；截图识别继续使用 Bob 已配置的 OCR 服务。

## 模型选择与实时目录

插件不在安装包中固化任何静态模型快照，完全通过网关实时目录工作：

- **新增或切换模型无需重装插件**：直接在「模型 ID / 路由组」修改完整 ID 即可立即生效。使用路由组时，在 Magpie 中调整该组的成员或路由策略即可，Bob 保留同一个组 ID。
- **实时验证与列举**：「验证」每次都会实时请求 `GET /v1/models`，检查当前填写的模型是否存在、是否支持文本以及思考强度是否合法；当模型字段留空时，验证提示中会列出实时获取的可用模型 ID（最多展示前 20 个，完整列表可看上述本机模型列表或 `npm run models`）。
- **多实例**：可在 Bob 中添加多个「Magpie」服务实例，分别填写不同模型和不同模式 / Prompt（例如一个实例专用于中英翻译，另一个实例设为「自定义」用于代码解释或总结）。

模型选择和切换均由用户决定，插件不会自动选中列表第一项，也不会在失败时自行换模型。若 Magpie 路由组自身配置了故障切换，则按 Magpie 的规则执行。

## 工作模式与自定义 Prompt

插件支持 4 种工作模式：

- **翻译**（默认）：根据 Bob 识别的源语言和目标语言执行翻译，支持选择**翻译风格**（默认 / 正式 / 口语化 / 直译 / 地道表达），并支持直接修改**翻译 Prompt**（留空恢复内置默认翻译 Prompt）。
- **润色**：保持原文语言与核心含义不变，修正语法、优化用词与表达流畅度。
- **提问**：将选中的文本直接作为问题发送给模型，简洁准确地作答。
- **自定义**：使用**自定义 Prompt** 对选中的文本执行任意指令（如总结、提取要点、代码解释、语法纠错等）。

### Prompt 模板变量

「翻译 Prompt」和「自定义 Prompt」均支持以下占位符：

- `{{from}}` / `{{to}}`：源语言 / 目标语言中文名称（如 `英语`、`简体中文`）
- `{{fromCode}}` / `{{toCode}}`：Bob 语言代码（如 `en`、`zh-Hans`）
- `{{text}}`：当前待处理的文本内容

当 Prompt 中**包含 `{{text}}`** 时，插件会将渲染后的整段内容作为 User 消息发送；**未包含 `{{text}}`** 时，Prompt 会作为 System Prompt 发送，划词或输入的原文会作为 User 消息发送。

## 配置项

| 选项 | 用法 |
| --- | --- |
| Magpie 地址 | 默认 `http://127.0.0.1:3425/v1`。也接受网关根地址或完整 `/v1/chat/completions` 地址。 |
| 模型 ID / 路由组 | 填写 Magpie 网关目录中的完整模型或路由组 ID；留空点击「验证」可实时查看可用列表。 |
| 网关密钥 | 本机留空，插件使用 `magpie-bob` 作为应用标识。远程网关填它的网关密钥。 |
| 模式 | 可选「翻译」「润色」「提问」「自定义」。 |
| 翻译风格 | 默认 / 正式 / 口语化 / 直译 / 地道表达，仅在「翻译」模式下生效。 |
| 翻译 Prompt | 仅在「翻译」模式下生效，默认预填标准翻译指令，可自由修改；留空则恢复默认。 |
| 自定义 Prompt | 仅在「自定义」模式下生效，支持 `{{from}}`、`{{to}}`、`{{text}}`。 |
| 输出方式 | 默认流式显示；兼容性有问题时可切换为完整返回。 |
| 思考强度 | 默认自动，不发送该参数。手动选择必须是当前模型支持的值，验证按钮会按目录检查。 |

「验证」只请求 `GET /v1/models`，检查地址、网关访问、实时模型 ID、已知思考强度以及自定义模式下是否已填写 Prompt，不调用模型、不消耗生成额度。

本机请求通常在 Magpie 用量中归为 `bob`。配置远程网关密钥时，由该密钥的权限、预算和 Magpie 规则约束。无需将上游厂商密钥填进 Bob。

## 响应与输出行为

- 「翻译」模式下源语言、目标语言跟随 Bob，区分简体中文与繁体中文；「润色 / 提问 / 自定义」模式不强制要求选定目标语言。
- 默认以纯文本流式显示，保留原文段落、换行与代码标识；支持取消请求和多个独立并发请求。
- 独立的模型思考字段不混入输出；开头的 `<think>...</think>` 也会过滤。
- 截断、空输出、内容过滤、网络或鉴权错误会显示中文提示，不把不完整的结果当成成功。
- 最长等待 120 秒。速度和输出质量取决于你选的模型。

## 数据流

插件仅把待处理文本、Prompt 指令和所选模型发送到配置的 Magpie 网关，由 Magpie 按现有配置调用上游。不记录原文、密钥或上游错误响应，没有遥测。公开包提供 GitHub `appcast.json`，供 Bob 检查插件版本更新；检查更新不会发送待翻译文字。Magpie 自身的日志、用量和隐私规则仍按其配置执行。

插件不读取 Magpie 的账号文件，不修改 Magpie 配置，不自动安装或启用其他插件，不改动 Bob 现有服务。

## 开发与验证

无需安装 npm 依赖。测试使用 Node.js 18+，打包使用 Python 3 标准库：

```sh
npm test
npm run build
npm run build:public
npm run models
npm run check:gateway
```

`build` 和 `build:public` 均离线打包（不附带任何静态模型列表）：前者生成本地开发包 `dist/magpie-1.2.0.bobplugin`（移除 `appcast` 防止被公开更新源覆盖），后者生成 `dist/public/magpie-1.2.0.bobplugin`（保留 `appcast` 适合公开发布）。

`models` 实时读取当前网关模型目录；`check:gateway` 使用插件真实验证入口对运行中的 Magpie 执行只读 `GET /v1/models` 校验（空模型列表提示、有效文本模型通过、无效模型拦截）。可用环境变量 `MAGPIE_URL` 与 `MAGPIE_GATEWAY_KEY` 指定远程网关，均不落盘。

安装包包含 `info.json`、`main.js`、`core.js`、`stream.js`、`icon.png` 及两份许可文件，直接位于 ZIP 根目录。构建会回读核验所有文件并生成 SHA-256 校验文件。

## 许可与致谢

代码采用 [MIT License](LICENSE)。Magpie 图标来自 [yetone/magpie](https://github.com/yetone/magpie)，许可及原作者声明见 [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES)。

## 官方接口依据

- [Magpie 接入应用](https://usemagpie.ai/docs/integrate)：网关、应用标识、模型目录及远程访问。
- [Magpie 插件开发](https://usemagpie.ai/docs/zh/plugins)：用户提供的参考文档。本项目安装在 Bob 内，通过 Magpie 网关接入。
- [Bob 文本翻译插件](https://bobtranslate.com/plugin/quickstart/translate.html)：入口、验证、取消与超时。
- [Bob HTTP 接口](https://bobtranslate.com/plugin/api/http.html)：请求与流式数据。
- [Bob 翻译结果格式](https://bobtranslate.com/plugin/object/translateresult.html)：新版 `content` 与旧版 `toParagraphs` 兼容。
- [Bob 插件打包](https://bobtranslate.com/plugin/quickstart/pack.html)：`.bobplugin` 包格式。
- [Bob 插件配置](https://bobtranslate.com/plugin/quickstart/info.html)：`icon.png` 图标与设置项定义。
- [Bob 文件接口](https://bobtranslate.com/plugin/api/file.html)：插件自身目录只读，沙盒目录可读写。

公开版本与更新说明见 [Releases](https://github.com/thirteenkai/bob-plugin-magpie/releases)。
