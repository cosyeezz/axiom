# 模型配置重构：调研、根因与取舍

日期：2026-10-02；实现依据：仓库锁定 Pi SDK 0.85.1。官方网页会变化，以下是本次查阅时的内容，不是长期能力保证。

## 主流产品比较

| 产品与一手来源 | 可核对的流程/引文 | Axiom 采用与不采用 |
| --- | --- | --- |
| [OpenCode Providers](https://opencode.ai/docs/providers/)、[Config](https://opencode.ai/docs/config/#locations) | `/connect` 认证、`/models` 选模型；OpenAI 可选 ChatGPT Plus/Pro 或 API Key。自定义连接提醒 “This only stores a credential for myprovider - you will need to configure it in opencode.json”。兼容协议区分 `/v1/chat/completions` 与 `/v1/responses`；多级配置合并。 | 采用认证与模型分层及协议明确选择。不照搬先存凭据再手写注册的割裂步骤；本次继续以 Axiom SQLite 为权威，不扩建项目级密钥优先级。 |
| [Cline OpenAI](https://docs.cline.bot/provider-config/openai)、[Compatible](https://docs.cline.bot/provider-config/openai-compatible) | 普通 OpenAI API 与 OpenAI Codex 独立 Provider；Codex “Click **Sign in with OpenAI** and complete browser OAuth”；“No API key entry required”；“Available models depend on your OpenAI plan”。兼容连接填写 Base URL、API Key、Model ID。 | 采用双入口，避免把 ChatGPT 订阅误配为普通 API Key。兼容端点保留独立模型定义和高级能力；不宣称所有 Provider 都有统一发现/检测接口。 |
| [Continue OpenAI](https://docs.continue.dev/customize/model-providers/top-level/openai)、[Models](https://docs.continue.dev/customize/models)、[Ollama](https://docs.continue.dev/guides/ollama-guide) | 模型条目使用 provider/model/apiKey/apiBase；兼容端点改 apiBase。OpenAI 文档说明 o-series/gpt-5 默认 Responses，可用 `useResponsesApi: false` 切换。Ollama 有 AUTODETECT；模型角色区分用途。 | 保留模型高级参数、协议和端点，不从模型名字猜测协议或支持能力。不把 YAML/多角色配置塞进首次连接流程；未找到足够证据证明 Continue 的 Codex 订阅路径，不作支持或不支持的断言。 |
| [Open WebUI Compatible](https://docs.openwebui.com/getting-started/quick-start/connect-a-provider/starting-with-openai-compatible)、[Direct Connections](https://docs.openwebui.com/features/chat-conversations/direct-connections) | “Saving a connection does not test it.” Verify 调用 `/models`；不支持该端点时仍可手填 Model IDs，不能据此判定聊天不可用。个人直连为实验功能，密钥保存在浏览器 localStorage。 | 采用保存、认证、目录、真实推理分层；保留手填模型。不照搬浏览器保存密钥和直连：Axiom 请求仍走服务端运行时。 |

四种产品的共同点不是某种表单外观，而是**连接身份、认证方式、协议适配、模型选择和实际生效值需要一致**。Axiom 本次沿用现有供应商 ID，不新增多账号连接别名或付费“测试请求”按钮。

## OpenAI Codex 的准确边界

[OpenAI 官方认证](https://developers.openai.com/codex/auth)区分订阅账号登录与按用量 API Key；该页直接抓取受403限制，产品事实以官方域名搜索片段和已读 SDK 源码交叉核实，不能写成“整个 Codex 产品只支持 OAuth”。

本次 **Axiom 的 `openai-codex` 适配器**走 Pi 原生 OAuth，API 为 `openai-codex-responses`，默认 `https://chatgpt.com/backend-api`；普通 `openai` 是另一条 API Key 路径。固定版本依据：

- [Pi 0.85.1 providers.md](https://github.com/earendil-works/pi/blob/v0.85.1/packages/coding-agent/docs/providers.md)
- [Pi 0.85.1 SDK](https://github.com/earendil-works/pi/blob/v0.85.1/packages/coding-agent/docs/sdk.md)
- [Pi Codex provider](https://github.com/earendil-works/pi/blob/v0.85.1/packages/ai/src/providers/openai-codex.ts)

浏览器回调监听在运行 Axiom 的机器（localhost:1455），手机/远程浏览器优先设备码，不手动粘贴 access token。桥接总上限20分钟，避免原10分钟超时截短 SDK 15分钟设备码期限；设备码本身仍受 SDK/服务端期限及账号权限限制。

## 可验证根因与处理

| 断层 | 修复与证据位置 |
| --- | --- |
| SDK `ProviderAuth.apiKey` 被直接作为 `authType` 发送，但 WS 和 SDK login 接受 `api_key` | `src/pi.js` 单点映射，只公开有 login 实现的方式。`tests/model-runtime-catalog.test.js` 使用真实 SDK 元数据、协议与桥接，不只测 fake。 |
| 工厂目录刷新，但旧会话独立 runtime 仍捕获旧供应商配置 | 工厂成功刷新推进版本；空闲时重选模型刷新同一会话 runtime 对象（不只替换对象引用），同模型重选也生效。`tests/model-config-runtime.test.js` 回环验证新 URL/key 和新供应商。共享 SQLite 凭据本来可被旧 runtime 读取，不能说所有凭据必然陈旧。 |
| SDK 组合错误通过 `getError()` 返回；凭据提交后内部同步也可能失败 | 检查目录错误，失败保留旧目录并允许 GET 重试；识别 CredentialSynchronizationError 已提交事实；广播异常不反转成功。目录刷新期间取消/超时不谎报凭据未保存。 |
| 登录凭据优先于 models/config.apiKey，两个入口同时存在时表单修改被静默忽略 | UI显示 SDK 来源类别；已有登录凭据时阻止新增/替换表单密钥，引导账号区更新或显式清除登录凭据。不自动迁移或删除 OAuth；保留旧配置兼容。 |
| 模型发现另行解析表单密钥，可能与推理的登录密钥不同 | 发现复用 SDK getAuth(providerId) 的有效认证、端点覆盖与供应商请求头；缺省值继承内置定义；先拦截命令型值，OAuth/Codex 使用内置目录。发现不套用单模型 Header 覆盖、不代表推理可用。 |
| 部分 Header 删除没有发送 null，后端合并后旧值残留 | 前端比较快照发送删除键；掩码改名需重填，大小写变更也清理旧键。UI 与 SDK 配置回归覆盖。 |

## 页面取舍

- 供应商列表保留已配置/待连接、搜索与草稿；供应商和模型分区，Codex/API双入口置前。
- 认证区解释来源；连接字段保留协议、端点、密钥，高级请求头和JSON按需展开。未知协议/字段不因渲染重置。
- 配置、凭据和目录分别展示；始终明确“连接未验证”，不使用目录加载冒充成功的绿灯。
- 遵守 Linear 主题 token、间距和现有组件；手机设置导航单行横滚，为授权表单留出空间。

## 验证与限制

- 本地真实 SDK + SQLite + 回环 HTTP 证明配置确实进入请求，而非只证明保存成功。
- 合成 OAuth 仅证明落库/重建/解析，模拟身份提供方验证 SDK 交互桥接；不代表真实 OpenAI 登录、token刷新或额度可用。
- Chromium 覆盖双主题、320/390/768/1440px、设备码/API Key/Escape/状态，另回归手机阅读与其他设置布局；不是移动真机、桌面壳或读屏验收。
- 保留原兼容配置和受控首次导入，不修改用户真实凭据。已有会话需空闲时重新选择模型或新建会话；不自动影响在途请求。
- 首次本人授权、账号权限、额度、网络与第一条真实模型请求仍须用户确认；本次没有真实服务/付费请求。
