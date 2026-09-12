# 模型配置与收藏 · 后端协议 v1

后端：worktree `src/`。WS 命令沿用现有封装：请求 `{ id, type, ... }`，响应
`{ type: "response", id, ok: true, data }` 或 `{ ok: false, error }`（中文错误消息）。
本文档是前后端唯一契约；前端模板（Ollama/OpenAI 兼容等常见预设）由前端自行处理。

## 数据模型

被编辑文件：`getAgentDir()/models.json`（pi 自定义供应商/模型，结构见 pi docs/models.md）。

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
| `{ "keep": true }` | 保留文件中的现值（无现值则报错“无可保留的密钥”） |
| 字符串 | 新值；**禁止前导 `!`**（不允许新增命令执行型凭据；`$$`/`$!` 转义与环境变量插值允许） |
| `null` | 删除该字段 |
| 字段整体缺省 | 不改动（provider.save 为合并语义时） |

服务端不解析、不执行、不日志记录任何密钥内容。

### fingerprint（防外部改动覆盖）

`sha256(models.json 原始字节)`；文件不存在时为 `sha256("")`（常量）。
所有写命令必须携带 `baseFingerprint`（来自最近一次 `models.config.get`）。
不匹配 → `ok:false`，error 含 **“已被外部修改”**，文件不变。客户端收到后应重新拉取。

**损坏保护**：文件存在但无法解析（含 JSONC 注释）或 providers 非对象时，
写命令一律报错拒绝，**绝不覆盖损坏文件**；GET 仍可用（`parseError` 字段报告原因，fingerprint 照常返回）。

## 命令

### models.config.get `{}`

```jsonc
{
  "fingerprint": "…",          // sha256 hex
  "path": "…/models.json",
  "parseError": "…",           // 可选：文件存在但不是有效 JSON（不支持 JSONC 注释）；此时 providers 为空、写命令拒绝执行
  "providers": [               // models.json 中的自定义/覆盖供应商，保持文件顺序；未知字段原样返回
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
  "catalog": [ /* 与 models.list 完全同构：已配置认证可用的模型（provider/id/name/key/levels/input） */ ]
}
```

配置页可编辑范围 = `providers`（models.json）。内置供应商出现在 `catalog` 供参照，
不直接编辑（覆盖内置供应商 = 在 providers 里新建同名 id）。

### models.provider.save `{ providerId, provider, baseFingerprint }` → `{ fingerprint }`

- `providerId`：`^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`（不含 `/`；可覆盖内置 id）
- `provider`：**合并语义**（不存在则创建）：
  - 已知字段 `name / baseUrl / api / oauth / authHeader / compat / apiKey / headers` 覆盖；发送 `null` 删除该字段
  - `apiKey` / `headers.*` 值支持掩码保留（见上表）
  - 文件里已有的 `models`、`modelOverrides` **不受本命令影响**；provider 对象上的未知顶层字段**原样保留**（无论是否回传）
  - `provider` 中出现 `models` / `modelOverrides` 键 → 报错（模型请走 models.model.save/delete）
- `baseUrl` 若提供必须为 http/https 绝对 URL（`new URL` 可解析），否则报错
- 返回新 `fingerprint`；成功后触发 `models.config.changed` 广播

### models.provider.delete `{ providerId, baseFingerprint }` → `{ fingerprint }`

删除整个 provider 条目（含其 models/modelOverrides）。不存在 → 报错。

### models.model.save `{ providerId, model, baseFingerprint }` → `{ fingerprint }`

- 按 `model.id` 在 `providers[providerId].models` 中 **upsert**（整条替换）
- provider 不存在 → 自动创建仅含该模型的 provider（提示：需随后补 baseUrl/api 才能加载）
- `model` 已知字段：`id`(必填) / `name` / `api` / `baseUrl`(同 URL 校验) / `reasoning` /
  `thinkingLevelMap`(键 off…max，值 string|null) / `input`(["text","image"]) / `cost` /
  `contextWindow` / `maxTokens` / `samplingParams` / `headers`(掩码语义) / `compat`；
  未知字段原样保存
- 返回新 `fingerprint`；触发 `models.config.changed`

### models.model.delete `{ providerId, modelId, baseFingerprint }` → `{ fingerprint }`

按 id 删除；provider 或模型不存在 → 报错。

### models.provider.discover `{ providerId }` → `{ models, truncated }`（只读）

从供应商在线拉取模型列表，供 UI 勾选后逐条调用 `models.model.save` 加入配置。**本命令不写盘、不启用模型、不触发 `refreshModels` / `models.config.changed`**，也无 baseFingerprint（不修改文件）。

- 读取已保存供应商的 `baseUrl` / `api` / `apiKey` / `headers`；**任何响应都不回传密钥明文**
- 凭据解析：`!command` 命令型值**直接拒绝**（不执行）；`$VAR`/`${VAR}`/`$$`/`$!` 沿用 SDK 真实插值语义；解析不出（如环境变量缺失）→ 安全报错
- 按 `api` 类型请求（官方接口已核实）：

| api | 请求 |
|---|---|
| `openai-completions` / `openai-responses` | `GET {baseUrl}/models`，`Authorization: Bearer`（无 apiKey 时省略，兼容本地服务器） |
| `anthropic-messages` | `GET {baseUrl\|https://api.anthropic.com}/v1/models?limit=1000`，`x-api-key` + `anthropic-version: 2023-06-01`（无 apiKey 报错） |
| `google-generative-ai` | `GET {baseUrl\|…/v1beta}/models?pageSize=1000`，`x-goog-api-key`（无 apiKey 报错） |

- `authHeader: true` 时额外附 `Authorization: Bearer`（无法解析 apiKey 时报错）；`oauth` 供应商不支持
- 超时 15 秒；响应体上限 5 MiB；`redirect: "error"`（重定向可能带走凭据，直接拒绝）；允许用户显式配置的本地 http 地址（如 Ollama）
- 返回：`models` 为 `{ id, name?, contextWindow?, maxTokens? }` 数组（最多 500 条，超出 slice 后 `truncated: true`）；
  `truncated` 另在 Anthropic `has_more` / Google `nextPageToken` 时为 true。
  **只透传接口确实给出的字段**：OpenAI 兼容接口仅 id（及服务器自带的 name）；Anthropic `display_name`→`name`；
  Google 去掉 `models/` 前缀为 id、`displayName`→`name`、`inputTokenLimit`→`contextWindow`、`outputTokenLimit`→`maxTokens`，
  并按 `supportedGenerationMethods` 含 `generateContent` 过滤（embedding/TTS 等非对话模型）；
  **未知 reasoning/上下文一律省略，不从名称猜测**
- 错误脱敏：固定中文文案 + HTTP 状态码；**绝不包含请求头、密钥、上游响应体**（网络错误/超时/重定向/非 JSON/结构无法识别/响应体过大各有独立文案）

### 写命令副作用（成功后依次）

1. 备份：原 `models.json` → `models.json.bak`（覆盖旧备份）
2. 临时文件 + `rename` 原子写；写入前用 SDK 真实 schema 校验，失败不落盘并返回安全错误消息，不回传可能包含凭据的原始错误；校验器不可用时拒绝写入
3. `refreshModels`：重建 `ModelRuntime`（**不联网**），`models.list` / `models.config.get`
   立即反映新目录；**新建会话与模型切换即刻生效**
4. 广播 `models.config.changed`

> SDK 行为边界：运行中会话持有的已绑定模型对象不会热更新；要在旧会话使用新目录，
> 需切换模型（configure）或新建会话。目录刷新后 configure 校验使用新目录。

## 收藏（favorites）

三组扁平有序 key 列表（组内唯一、按收藏先后排序，每组上限 200）：

- `provider`：供应商 id，如 `"anthropic"`
- `model`：模型完整 key，如 `"anthropic/claude-…"`；允许模型 ID 中的冒号，如 `"ollama/llama3.1:8b"`
- `thinking`：模型+思考等级，key 形如 `"anthropic/claude-…:high"`
  （最后一个 `:` 后为等级：`off|minimal|low|medium|high|xhigh|max`）

存储：`$AXIOM_HOME`（默认 `~/.axiom`）`/models-favorites.json`，原子写：

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
