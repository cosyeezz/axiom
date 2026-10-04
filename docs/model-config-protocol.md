# 模型配置与收藏 · 后端协议 v1

后端：worktree `src/`。WS 命令沿用现有封装：请求 `{ id, type, ... }`，响应
`{ type: "response", id, ok: true, data }` 或 `{ ok: false, error }`（中文错误消息）。
网页以 Pi 原生供应商、认证与目录为准，不维护厂商模板或显隐管理。旧细粒度写入/发现命令保留供兼容；当前网页使用 `models.provider.configure` 编辑 Pi 原生对象。

## 数据模型

权威存储：Axiom SQLite 的 models/config（凭据 auth/<providerId>、收藏 models/favorites；旧 models/hidden 只留存、不再消费）。**不双写**：SQLite 是唯一权威，models.compat.json 只是每次写库后全量重写的派生镜像（可随时删除重建，重启自动恢复）；旧 Pi models.json / auth.json 只读导入、绝不回写。

**一次导入门闩**：models.json / auth.json 按来源独立，只检查各自迁移标记。成功导入或确认无文件后关闭该来源窗口，权威清空也不会复活导入；权威已存在且无遗留告警时补打标记，不回读旧文件。坏文件/坏结构记录去重告警、不打完成标记，修复后重试只补缺失条目，不覆盖已存在权威配置或凭据。收藏仍按权威为空才导入，非法来源显示告警。

### 思考等级（全协议统一口径）

七级：`off | minimal | low | medium | high | xhigh | max`（selection.thinking、thinkingLevelMap 键、收藏 thinking 组 key 后缀同用此表，选择器同序）。模型上的 `thinkingLevelMap` 把等级映射为 API 取值（string）；值为 `null` 表示对该模型禁用该等级。

### 密钥脱敏（GET 永不回传明文）

`apiKey` 与 `headers.*` 的每个值，GET 时替换为掩码对象：

```json
{ "masked": true, "kind": "command" | "env" | "literal" }
```

- `command`：值以 `!` 开头（shell 命令取密钥）
- `env`：值以 `$VAR` / `${VAR}` 环境变量插值开头
- `literal`：其余（明文或 `$$`/`$!` 转义）

### 保存时的密钥语义（apiKey / headers 每个值）

| 客户端发送 | 含义 |
|---|---|
| `{ "keep": true }` | 保留库中的现值（无现值则报错“无可保留的密钥”） |
| 字符串 | 新值；**禁止前导 `!`**（不允许新增命令执行型凭据；`$$`/`$!` 转义与环境变量插值允许） |
| `null` | 删除该字段 |
| 字段整体缺省 | 不改动（provider.save 为合并语义时） |

配置读写不执行或记录密钥；在线拉取仅解析环境变量并用于请求，不回传明文。

### fingerprint（防外部改动覆盖）

`sha256(canonicalModelsJson(权威配置))`；空配置同样按规范序列化计算。
所有写命令必须携带 `baseFingerprint`（来自最近一次 `models.config.get`）。
不匹配 → `ok:false`，error 含 **“已被外部修改”**，权威配置不变。客户端收到后应重新拉取。

**损坏保护**：库内 providers 非对象时拒绝写入；旧文件导入失败通过 parseError 提示，允许在页面重新配置，不覆盖旧文件。

## 命令

### models.config.get `{}`

```jsonc
{
  "fingerprint": "…",          // sha256 hex
  "path": "…/models.compat.json",
  "applied": true,             // false = 已保存但派生/刷新未完成，见 applyError
  "applyError": "…",           // 可选：挂起应用状态的失败原因（GET 读取路径会顺带重试）
  "parseError": "…",           // 可选：旧配置导入告警（仅权威为空时）或库内结构无效
  "authProviders": [           // Pi 供应商及原生登录方式，环境认证供应商的 methods 可为空
    { "id": "anthropic", "name": "Anthropic", "configured": true, "usingOAuth": false, "authSource": "stored",
      "methods": [ { "type": "oauth", "name": "…" }, { "type": "api_key", "name": "…" } ] }
  ],
  "providers": [               // SQLite 中的自定义/覆盖供应商，保持配置顺序；未知字段原样返回
    {
      "id": "my-provider",
      "name": "…", "baseUrl": "https://…", "api": "openai-completions",
      "apiKey": { "masked": true, "kind": "env" },
      "oauth": "radius", "authHeader": true,
      "headers": { "x-key": { "masked": true, "kind": "literal" } },
      "compat": { … },
      "models": [ { "id": "…", "name": "…", "reasoning": true, "headers": { …掩码同上 }, … } ],
      "modelOverrides": { "anthropic/claude-…": { …, "headers": { …掩码 } } },
      "…未知字段原样"
    }
  ],
  "catalog": [ /* Pi 全部模型定义（含未登录条目）：provider/id/name/key/levels/input/
                   api/reasoning/contextWindow/maxTokens/thinkingLevelMap/cost；绝不返回 headers/apiKey */ ]
}
```

配置页只读展示 `catalog`；`models.list` 为 SDK 提供的可用目录，不再按历史隐藏清单过滤。
高级编辑器直接编辑 `providers` 中一个供应商对象（包括 Pi 原生 `models/modelOverrides`）。

### models.provider.configure `{ providerId, provider, baseFingerprint }` → `{ fingerprint, applied, applyError? }`

- 当前网页写入口：整供应商**替换**，不是合并；未发送字段被删除。Pi 内置定义继续由 SDK 解析，不改内置目录。
- `provider` 使用 Pi 原生 provider JSON。模型能力和未知扩展字段不经另一套表单转换/剥离；最终由已安装 SDK schema 校验，校验不可用或失败不落库。
- provider `apiKey`、provider/model/modelOverride `headers.*` 支持同位置 `{keep:true}`；缺省、null 或空 headers 按替换语义移除旧字段，不能用 keep 跨模型复制秘密。新增 `!command` 与非 http(s) baseUrl 拒绝。
- 已有存储登录凭据/运行时覆盖时，拒绝会被覆盖的新自定义 API Key；保留/删除不隐式登出。
- 沿用指纹检查和原文 CAS；草稿绑定开始编辑时的指纹，刷新不静默升级该指纹。成功后派生文件、目录刷新和广播沿用下述写入流程。
- 旧 `provider.save/model.save/model.override` 等仍保持原合并语义，供兼容，不是当前页面入口。

### models.provider.save `{ providerId, provider, baseFingerprint }` → `{ fingerprint }`

- `providerId`：`^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`（不含 `/`；可覆盖内置 id）
- `provider`：**合并语义**（不存在则创建）：
  - 已知字段 `name / baseUrl / api / oauth / authHeader / compat / apiKey / headers` 覆盖；发送 `null` 删除该字段
  - `apiKey` / `headers.*` 值支持掩码保留（见上表）
  - 配置里已有的 `models`、`modelOverrides` **不受本命令影响**；provider 对象上的未知顶层字段**原样保留**（无论是否回传）
  - `provider` 中出现 `models` / `modelOverrides` 键 → 报错（模型请走 models.model.save/delete）
- `baseUrl` 若提供必须为 http/https 绝对 URL（`new URL` 可解析），否则报错
- 登录凭据优先于表单密钥；已有存储凭据/运行时覆盖时，变更表单 `apiKey` 字符串被拒绝，提示通过账号授权区更新或先显式清除登录凭据。`keep`/缺省/删除仍允许，不自动迁移或删除 OAuth。
- Header 为按键合并：前端部分删除必须发送该键 `null`；掩码 Header 改名须重填值，防止 `keep` 指向不存在的新键。
- 返回新 `fingerprint`；成功后触发 `models.config.changed` 广播

### models.provider.delete `{ providerId, baseFingerprint }` → `{ fingerprint }`

删除整个 provider 条目（含其 models/modelOverrides）。不存在 → 报错。

### models.provider.rename `{ providerId, newProviderId, baseFingerprint }` → `{ fingerprint }`

按新 id 整条搬家（`models` / `modelOverrides` / 未知字段 / 密钥原值一并跟随，不回传、不重写）。

- 两个 id 均需满足 provider id 白名单；`providerId` 不存在或 `newProviderId` 已存在 → 报错（不覆盖同名条目）
- 改名是本命令唯一入口：前端无法用 save + delete 复现（`modelOverrides` 没有独立写命令，会被悄悄丢掉）
- 成功后触发 `models.config.changed`；依赖旧 id 的收藏（favorites）不会自动改名

### models.model.save `{ providerId, model, baseFingerprint }` → `{ fingerprint }`

- 按 `model.id` 在 `providers[providerId].models` 中 **upsert**（整条替换）
- provider 不存在 → 自动创建仅含该模型的 provider（提示：需随后补 baseUrl/api 才能加载）
- `model` 已知字段：`id`(必填) / `name` / `api` / `baseUrl`(同 URL 校验) / `reasoning` /
  `thinkingLevelMap`(键 off…max，值 string|null) / `input`(["text","image"]) / `cost` /
  `contextWindow` / `maxTokens` / `samplingParams` / `headers`(掩码语义) / `compat`；
  未知字段原样保存
- 返回新 `fingerprint`；触发 `models.config.changed`

### models.model.override `{ providerId, modelId, override, baseFingerprint }` → `{ fingerprint }`

统一编辑内置/扩展目录里的单个模型定义（自定义模型请用 models.model.save 整条管理）。

- `modelId` 必须命中当前目录中的 `provider/id`（未知模型拒绝）
- `override`：`models.model.save` 的 schema 去掉 `id` / `api` / `baseUrl` 后 strict
  （协议与归属由供应商定义，覆盖不可改）；已知字段见 model.save
- 合并语义（写入 `providers[providerId].modelOverrides[modelId]`）：`null` 删除该覆盖字段；
  `headers` 沿用掩码 keep；`thinkingLevelMap` / `cost` / `compat` / `samplingParams` 按键级深合并；
  其余字段直接覆盖；所有覆盖字段清空 → 整条覆盖删除（恢复内置定义）
- 只保存修改的字段，未覆盖能力保持内置定义不变（与旧「同名整条覆盖会丢成本/上下文」不同）
- 返回新 `fingerprint`；触发 `models.config.changed`

### models.model.delete `{ providerId, modelId, baseFingerprint }` → `{ fingerprint }`

按 id 删除；provider 或模型不存在 → 报错。

### models.provider.discover `{ providerId }` → `{ models, truncated }`（只读）

从供应商在线拉取模型列表，供 UI 勾选后逐条调用 `models.model.save` 加入配置。**本命令不写盘、不启用模型、不触发 `refreshModels` / `models.config.changed`**，也无 baseFingerprint（不修改文件）。

- 读取已保存供应商配置，缺省协议/端点继承运行时内置目录；服务端复用 SDK `getAuth(providerId)` 解析有效认证（存储凭据优先于表单密钥）、认证端点覆盖及供应商请求头，避免发现和推理用不同密钥。发现是供应商级操作，不套用单模型 Header 覆盖；**任何响应都不回传密钥明文**
- 凭据解析：`!command` 命令型值**直接拒绝**（不执行）；`$VAR`/`${VAR}`/`$$`/`$!` 沿用 SDK 真实插值语义；解析不出（如环境变量缺失）→ 安全报错
- 按 `api` 类型请求（官方接口已核实）：

| api | 请求 |
|---|---|
| `openai-completions` / `openai-responses` | `GET {baseUrl}/models`，`Authorization: Bearer`（无 apiKey 时省略，兼容本地服务器） |
| `anthropic-messages` | `GET {baseUrl\|https://api.anthropic.com}/v1/models?limit=1000`，`x-api-key` + `anthropic-version: 2023-06-01`（有 apiKey 时添加） |
| `google-generative-ai` | `GET {baseUrl\|…/v1beta}/models?pageSize=1000`，`x-goog-api-key`（有 apiKey 时添加） |

- `authHeader: true` 时额外附 `Authorization: Bearer`（无法解析 apiKey 时报错）；`oauth` 供应商不支持
- 超时 15 秒；响应体上限 5 MiB；`redirect: "error"`（重定向可能带走凭据，直接拒绝）；允许用户显式配置的本地 http 地址（如 Ollama）
- 返回：`models` 为 `{ id, name?, contextWindow?, maxTokens? }` 数组（最多 500 条，超出 slice 后 `truncated: true`）；
  `truncated` 另在 Anthropic `has_more` / Google `nextPageToken` 时为 true。
  **只透传接口确实给出的字段**：OpenAI 兼容接口仅 id（及服务器自带的 name）；Anthropic `display_name`→`name`；
  Google 去掉 `models/` 前缀为 id、`displayName`→`name`、`inputTokenLimit`→`contextWindow`、`outputTokenLimit`→`maxTokens`，
  并按 `supportedGenerationMethods` 含 `generateContent` 过滤（embedding/TTS 等非对话模型）；
  **未知 reasoning/上下文一律省略，不从名称猜测**
- 错误脱敏：固定中文文案 + HTTP 状态码；**绝不包含请求头、密钥、上游响应体**（网络错误/超时/重定向/非 JSON/结构无法识别/响应体过大各有独立文案）

### 已移除：models.hidden.set

协议拒绝此命令，配置 GET 不再返回 hidden，目录不再消费旧 models/hidden；旧数据不删除。

### 模型登录（models.auth.*，网页内完成订阅/凭据登录）

登录流程由 SDK 驱动（授权 URL / 设备码 / 交互提问），凭据由 SDK 直接落 SQLite
（auth/<providerId>）；桥接层不保存、不回传任何凭据。一个 WS 连接同一时刻一个流程，
同供应商全局互斥（运行中不接受第二个登录，也不允许另一窗口登出）。
支持原生 text/secret/select/manual_code；单步 prompt.signal 取消只结束该输入，整体 signal 才终止登录。WS 断开取消并移除所属流程，不支持跨连接恢复；网页刷新需重登。

- `models.auth.list {}` → `{ providers }`（同 config.get 的 authProviders：id/name/methods/configured/usingOAuth/authSource）。SDK `ProviderAuth.apiKey` 映射为协议 `api_key`，只展示具有 login 实现的 `apiKey` / `oauth`。`configured` 与 `usingOAuth` 为本地凭据快照，不代表远端连接、订阅额度或模型权限已验证。
- `models.auth.start { providerId, authType }` → `{ flowId, providerId, status, events, prompt? }`；
  `authType` ∈ `api_key | oauth`，须是该供应商声明的方式；流程总上限20分钟（不截短 SDK Codex 15分钟设备码期限）；未提交凭据时超时取消，保存后仅中止授权信号、等待目录收尾，不回滚凭据
- `models.auth.status { flowId }` → 同上视图（前端 800ms 轮询，短暂失败最多重试三次，不重启登录）
- `models.auth.respond { flowId, promptId, value }` → 同上；回答当前交互提问（select 选项校验，
  文本 ≤8192，允许空字符串并交由 SDK/provider 校验，如 Copilot 默认域名）；prompt 已更新或流程非 running → 报错
- `models.auth.cancel { flowId }` → 同上（中止授权；凭据已保存则等待目录收尾并返回真实 success/error，不误报未保存）
- `models.auth.logout { providerId }` → `{ ok: true }`（删除凭据并刷新目录；该供应商登录进行中 → 拒绝）
- 事件视图：`auth_url` / `device_code` / `info`；URL 只回传 https 或本机地址，文本截断到 2000 字
- 登录视图增加 `credentialsSaved: boolean` 与可选 `applied: boolean`；凭据保存后目录重建失败返回 `status: error, credentialsSaved: true, applied: false`，提示无需重复授权。SDK `CredentialSynchronizationError`（login 已提交）同样进入目录重建；异常携带的 credential/cause 不下发。广播失败不反转保存和应用结果。
- `authSource` 为 SDK 的本地来源类别：stored/runtime/environment/models_json_key/models_json_command/fallback（可缺省），不下发 label 或秘密；清除登录凭据不清除表单/环境配置，也不保证供应商变为不可用。
- 登录成功或凭据已保存后服务端尝试 `refreshModels` 并广播 `models.config.changed`；登出后也刷新目录。
- `openai-codex` 使用 SDK 原生 OAuth（浏览器或设备码），API 为 `openai-codex-responses`，内置端点 `https://chatgpt.com/backend-api`。普通 `openai` API Key 是独立入口；Codex 不要求用户手填 token 或自建通用 OpenAI 兼容连接。远程部署优先设备码，账号权限按 OpenAI 提示由本人确认。

### 写命令副作用（成功后依次）

1. 用 SDK 真实 schema 校验候选配置；校验器不可用或校验失败时拒绝写入，错误不包含凭据。
2. 保存 SQLite 权威配置，同步 models.compat.json 派生镜像（不改旧 Pi 文件）。
3. `refreshModels`：重建 `ModelRuntime`（**不联网**），`models.list` / `models.config.get`
   立即反映新目录；检查 SDK `getError()`，组合错误时保留上次已应用目录并返回未应用状态。
   启动/认证后的应用错误也进入 GET 重试路径。**新建会话与模型切换即刻生效**
4. 广播 `models.config.changed`

> SDK 行为边界：运行中会话持有的已绑定模型对象不会热更新；要在旧会话使用新目录，
> 需重新选择模型（configure，包括重选同一模型）或新建会话。目录成功刷新后推进版本，
> configure 使用新目录校验，并无网络刷新该会话独立 runtime，再设置模型；只换模型对象
> 不足以更新供应商端点/凭据，也无法接入会话创建后新增的供应商。不会打断在途请求。
> 应用目录不是网络连通性测试；页面始终分开展示配置、认证、目录与“连接未验证”。

## 收藏（favorites）

三组扁平有序 key 列表（组内唯一、按收藏先后排序，每组上限 200）：

- `provider`：供应商 id，如 `"anthropic"`
- `model`：模型完整 key，如 `"anthropic/claude-…"`；允许模型 ID 中的冒号，如 `"ollama/llama3.1:8b"`
- `thinking`：模型+思考等级，key 形如 `"anthropic/claude-…:high"`
  （最后一个 `:` 后为等级，七级见「思考等级」小节；模型 id 允许含冒号，只按最后一个切分）

存储：Axiom SQLite 的 models/favorites；旧 models-favorites.json 仅用于导入：

```json
{ "version": 1, "provider": [], "model": [], "thinking": [] }
```

### models.favorites.get `{}` → `{ provider: [...], model: [...], thinking: [...] }`

### models.favorites.set `{ kind, key, favorite }` → 同 get 的三组对象

- `kind`：`"provider" | "model" | "thinking"`
- `key`：对应组的 key（见上）
- `favorite`：`true`=收藏、`false`=取消（幂等）
- key 格式非法即报错；成功后持久化并广播（见下）

## 服务器主动事件（无 id；广播给**所有** WS 客户端 → 跨窗口共享）

```jsonc
{ "type": "models.config.changed" }  // 任一配置写命令成功后；客户端应重拉 models.config.get 与 models.list
{ "type": "models.favorites.changed", "data": { "provider": [], "model": [], "thinking": [] } }  // favorites.set 成功后携带全量，无需回读
```

## 安全边界

- 仅 127.0.0.1 回环 + 本机 Origin 可连（现有 upgrade 校验不变，无新增 HTTP 端点）
- 新增 `apiKey` / `headers` 值禁止 `!command` 形式；已有命令型值只能经 `{keep:true}` 原样保留
- `baseUrl` 仅允许 http/https；providerId/modelId 白名单校验；所有命令经 zod 严格校验（未知顶层字段拒绝）
- 测试与真实密钥隔离：服务端任何响应/日志不含密钥明文
