---
name: design
description: 项目设计系统。凡涉及 UI、页面、组件、样式、配色的任务，必须先执行此 skill，读取对应风格的设计规范并严格遵循其 token 与规则。
---

# 项目设计系统（DESIGN.md）

本项目 UI 以品牌设计规范为基准。`styles/` 目录下每个 `.md` 文件是一套完整的
设计系统规范：颜色 token、字体层级、间距、圆角、阴影、组件规则、明暗模式。

## 可用风格（26 种）

### 默认

| 风格 | 文件 | 气质 | 适用场景 |
|------|------|------|----------|
| linear | `styles/linear.app.md` | 近黑底 #010102、薰衣草蓝紫 #5e6ad2、精密克制 | 开发者工具、暗色 SaaS（**未指定时的默认**） |

### AI & LLM 平台

| 风格 | 文件 | 气质 |
|------|------|------|
| claude | `styles/claude.md` | 陶土暖色、干净编辑排版 |
| cohere | `styles/cohere.md` | 活力渐变、数据仪表盘 |
| elevenlabs | `styles/elevenlabs.md` | 暗色电影感、声波美学 |
| minimax | `styles/minimax.md` | 大胆暗色、霓虹点缀 |
| mistral.ai | `styles/mistral.ai.md` | 法式极简、紫调 |
| ollama | `styles/ollama.md` | 终端优先、黑白极简 |
| opencode.ai | `styles/opencode.ai.md` | 开发者向暗色主题 |
| replicate | `styles/replicate.md` | 纯白画布、代码优先 |
| runwayml | `styles/runwayml.md` | 电影节编辑风、纯黑药丸按钮 |
| together.ai | `styles/together.ai.md` | 技术蓝图风 |
| voltagent | `styles/voltagent.md` | 虚空黑、祖母绿、终端原生 |
| x.ai | `styles/x.ai.md` | 严酷黑白、未来极简 |

### 开发者工具 & IDE

| 风格 | 文件 | 气质 |
|------|------|------|
| cursor | `styles/cursor.md` | 时髦暗色、渐变点缀 |
| expo | `styles/expo.md` | 暗色、紧字距、代码中心 |
| lovable | `styles/lovable.md` | 俏皮渐变、友好 |
| raycast | `styles/raycast.md` | 暗色铬感、活力渐变 |
| superhuman | `styles/superhuman.md` | 高端暗色、键盘优先、紫光晕 |
| vercel | `styles/vercel.md` | 黑白极简、Geist 字体、高对比 |
| warp | `styles/warp.md` | 暗色 IDE 感、块状命令 UI |
| clickhouse | `styles/clickhouse.md` | 黄色点缀、技术文档风 |

### 其他精选

| 风格 | 文件 | 气质 |
|------|------|------|
| stripe | `styles/stripe.md` | 深蓝墨色、靛紫渐变、金融感 |
| supabase | `styles/supabase.md` | 暗色祖母绿、代码优先 |
| notion | `styles/notion.md` | 暖白、衬线标题、柔和表面 |
| resend | `styles/resend.md` | 极简暗色、monospace 点缀 |
| posthog | `styles/posthog.md` | 活泼刺猬风、开发者友好的暗色 |

## 工作流程

1. **确定风格**：用户指定了就用指定的；没指定时默认 `linear`，或根据任务气质推荐并说明理由。
2. **读取规范**：用 `read` 读取完整文件，路径相对项目根：
   `.pi/skills/design/styles/<风格>.md`
3. **严格遵循**：生成的 UI 必须使用规范中的颜色、字体、间距 token 和组件规则，
   不得随意引入规范之外的颜色或字体；规范未覆盖处保持同风格气质。
4. **说明依据**：交付时简要列出用了哪些关键 token，便于核对。

## 看效果图 / 加新风格

- 浏览器预览任意风格的实时渲染：`https://getdesign.md/design-md/<品牌名>/preview`
  （品牌名与 `styles/` 文件名一致，如 linear：https://getdesign.md/design-md/linear.app/preview ）
- 全部 74 种风格清单：https://github.com/voltagent/awesome-design-md
- 用户想要清单之外的风格时，下载后存入 `styles/` 并更新上表：
  ```
  curl -o .pi/skills/design/styles/<品牌>.md https://raw.githubusercontent.com/voltagent/awesome-design-md/main/design-md/<品牌>/DESIGN.md
  ```
  或用官方 CLI（在项目根执行）：`npx getdesign@latest add <品牌>`
