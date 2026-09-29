# 统一思考等级选择

## 结论与范围

思考等级是用户意图，不是统一计算预算。Axiom 保留 `off / minimal / low / medium / high / xhigh / max` 的内部词汇；具体模型能选择哪些等级，由固定版本 Pi SDK 的 `getSupportedThinkingLevels(model)` 决定，原生请求参数仍由 Pi 的 API 适配层转换。模型目录和会话快照是 UI 的能力来源，不根据供应商名称复制第二套规则。

这次重构覆盖输入区、主/子代理默认配置、当前子代理、自动/手动压缩相关设置、独立 Pi 修复器和模型能力编辑器。未新增供应商、推理预算编辑、在线模型探测或运行中子任务热切换。

## 调研依据与取舍

官方语义资料（核查日 2026-09-29；以下为官方页面索引摘要核查，部分原页抓取受限，不宣称完整阅读或真实请求验证）：

| 来源 | 关键边界 |
| --- | --- |
| [OpenAI GPT-5.1 指南](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-1_prompting_guide)、[模型页](https://developers.openai.com/api/docs/models/gpt-5.1) | `none` 不等于旧 `minimal`；该模型默认 none、支持 none/low/medium/high，不能外推到所有型号 |
| [Anthropic effort](https://platform.claude.com/docs/en/build-with-claude/effort) | effort 是行为引导而非严格 token 预算；adaptive 是 thinking 模式，不是 effort 档位；max 不取消输出上限 |
| [Anthropic extended thinking](https://platform.claude.com/docs/en/build-with-claude/extended-thinking) | 手动 budget_tokens 有最小值和输出预算约束，0 不是通用 disabled 写法；interleaved 模式有单独规则 |
| [Gemini thinking](https://ai.google.dev/gemini-api/docs/generate-content/thinking) | Gemini 3 的 thinkingLevel 与 2.5 的 thinkingBudget 不等价；minimal 不保证关闭；-1 表示动态；能否关闭及默认值依模型而异 |

成熟项目比较：

1. **Pi v0.85.1**（固定 commit `d981de1229ef899957bbe968bc8dcda02a21f477`）：[目录生成](https://github.com/badlogic/pi-mono/blob/d981de1229ef899957bbe968bc8dcda02a21f477/packages/ai/scripts/generate-models.ts#L1133-L1145)记录 reasoning 与 thinkingLevelMap；[能力查询](https://github.com/badlogic/pi-mono/blob/d981de1229ef899957bbe968bc8dcda02a21f477/packages/ai/src/models.ts#L913-L924)产生统一等级；[OpenAI 请求映射](https://github.com/badlogic/pi-mono/blob/d981de1229ef899957bbe968bc8dcda02a21f477/packages/ai/src/api/openai-responses.ts#L337-L350)在 API 层转换原生参数。Axiom 已依赖该 SDK，应直接复用，而不是复制规则。
2. **OpenCode**（固定 commit `7945de208964a49300d7f770d1a71d078db9a4c4`）：[模型归一化与 variants](https://github.com/anomalyco/opencode/blob/7945de208964a49300d7f770d1a71d078db9a4c4/packages/opencode/src/provider/provider.ts#L1316-L1370)、[转换层](https://github.com/anomalyco/opencode/blob/7945de208964a49300d7f770d1a71d078db9a4c4/packages/opencode/src/provider/transform.ts#L1717-L1725)、[请求消费 variant](https://github.com/anomalyco/opencode/blob/7945de208964a49300d7f770d1a71d078db9a4c4/packages/opencode/src/session/llm/request.ts#L80-L91)体现能力生成、用户选择、请求应用分层。variant 是参数预设而不是统一等级，不适合再搬入 Axiom 形成第二套适配权威。

现状审计发现：模型目录本已从 SDK 返回 levels，但各表单、输入区和离线修复分别构造选项；模型切换存在追加不可用值、强行 off、借用旧主模型能力等分叉。最终只统一 Axiom 的意图/交互层，保留 SDK 原生参数处理与场景兼容策略。

## 分层设计

```text
模型目录与自定义 thinkingLevelMap
        ↓ Pi getSupportedThinkingLevels
models.list / session.config 的 levels
        ↓
public/thinking.js：规范化能力、三种适配策略、收藏键
        ↓
public/thinking-picker.js：requested / effective / inherited / unavailable
        ├─ 原生 select + 现有 model-picker 增强（各设置表单）
        └─ 通用 choice-column（输入区级联可搜索菜单）
        ↓ 保存偏好 / 显式运行配置
Pi AgentSession 与 API 适配层：供应商原生参数
```

`public/thinking.js` 是无 DOM、无 SDK 依赖的共享模块，同时供服务端协议枚举、配置校验和独立修复 CLI 使用。放在 public 是为了浏览器原生 ES modules 直接加载，不需要构建或复制模块。服务端静态资源必须登记新模块，npm 包继续包含 public。

模型能力编辑器复用等级常量，但不是普通选择器：其职责是编辑 `reasoning` 和 `thinkingLevelMap`，必须保留多选、字段继承/清除和原生映射值，不将它错误改成单选控件。

## 语义及兼容性

| 场景 | 策略 | 不支持所选等级时 |
| --- | --- | --- |
| 普通选择预览、SDK 创建/恢复模型 | `nearest` | 优先下一个较高支持等级；没有更高等级则取最高支持等级，与 SDK clamp 一致 |
| 主会话显式热更新 | `strict` | 拒绝请求，不静默改成别的等级 |
| 压缩模型偏好 | `lowest` | 使用该模型最低支持等级，保留已有产品语义；关闭自动压缩时手动压缩仍适配，并在执行边界使请求与运行记录一致 |
| 离线修复手动输入 | 手动模式 | 不宣称支持性；将所选统一等级交给修复 Pi CLI |

- `null`/空值表示继承或沿用默认，不等于 `off`。`off` 也不能保证禁用模型内部推理。
- 未知/缺失能力不能从其他模型借用，也不能退回“支持全部等级”；显式选择无可用等级时呈现错误状态。继承选项仍可以保存为继承。默认配置未指定模型时采用 deferred 偏好模式，可编辑七档合法偏好，但明确说明创建时才按实际模型适配，不代表某模型的支持集合，也不绑定当前会话收藏。
- 默认设置保留请求偏好；换模型时只更新展示的实际等级，不触发保存。回到原模型可以恢复先前偏好。当前会话显式操作仍保存实际选择。
- 子代理未指定模型时，从表单当前主模型解析能力，而不是借用旧会话模型。更换主供应商或模型立即刷新继承子代理与压缩选择器。
- 收藏继续沿用 `provider/model:level`，等级上下文随有效模型更新。更换模型不显示其他模型的等级收藏。
- 保留现有数据库、协议和 JSON 配置字段；不迁移已有收藏和偏好，不扩大子任务热更新语义。

## 组件边界与生命周期

共享选择视图模型仅产生可选项、请求值、实际值、适配说明与能力不可用状态。表单渲染器负责原生 select、约束校验、模型上下文与增强控件同步；输入区渲染器使用同一视图模型，但沿用级联列的搜索、收藏、返回、选择事件和现有 CSS。

重复同步不重复注册监听；表单被替换时显式释放，目录刷新同时清理已断开的控件。纯渲染不 dispatch change，避免打开设置或刷新目录时意外写配置。输入区目录更新或失去可用性时关闭陈旧菜单，提交时重新检查支持性。旧隐藏配置控件脱离消息发送表单，保留配置错误但不阻止已有会话发送消息。

## 验证边界

离线测试覆盖能力规范化、稀疏等级、三种降级规则、空能力、继承与 off 区分、切换后偏好恢复、模型上下文收藏、选择器销毁、各入口表单及持久化回归。真实 SDK 合约测试只使用本地模型对象或假供应商，不调用付费模型。

未将统一等级解释为相等的 token/费用预算；未宣称每个供应商账号都已真实请求验证。供应商文档与 SDK 支持变化应通过升级 SDK、更新合约测试处理，而不是向 UI 增加供应商分支。
