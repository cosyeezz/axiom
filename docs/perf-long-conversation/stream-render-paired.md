# 流式单帧耗时配对微基准（独立复核轮·方法说明）

本文件只说明采集方法；数值见同目录 `stream-render-paired.json`，可复现脚本为 `stream-microbench.mjs`。
原始基线 `stream-render.json`、`measure.mjs`、`README.md` 等**保持未改动**。

## 一、为什么是「新配对口径」而不是旧样本复现

原基线 `stream-render.json` 只保留了协议参数（`sampleTextChars:43645`、`chunkChars:600`、
`tailFramesMs` 4 项）与统计值，**原始样本文本未随仓库保留**（当时即为临时导出后删除）。
因此无法逐字节复现旧样本，本组不伪作复现，改为在**同一浏览器、同一设备、同一文本**下对
`c7cf8a5` 与工作树未提交版本做配对测量，两版本共用同一份文本，只比较同轮差值。

## 二、口径（尽量对齐原 `stream-render.json`）

| 项 | 设定 |
| --- | --- |
| 被测函数 | `public/markdown.js` 的 `renderMarkdown(element, text)` |
| 样本 | 真实会话（隔离副本，session `55e7fce9`）assistant text 片段按序拼接，取前 43645 字符 |
| 样本 hash | `249461bf…acba8d`（sha256，见 JSON；原文不入仓库） |
| 帧步长 | 每帧追加 600 字符（累计增长），共 73 帧 |
| 计时区间 | 仅 `renderMarkdown` 调用本身 |
| 强制布局 | 每帧计时结束后 `void element.offsetHeight`（布局耗时单列，不计入帧耗时） |
| 尾部窗口 | 最后 4 帧（`42000/42600/43200/43645` 字符） |
| 冷暖 | 每次运行新页面 + 新元素（块缓存冷）；另测一次新元素整段全量渲染（`fullColdMs`） |
| 重复 | 每版本 3 次，交替执行（baseline/current 轮换） |

## 三、结论（同环境配对，不跨环境比较）

- 尾部均值：`c7cf8a5` 5.73ms → 未提交版本 4.74ms（**-17.3%**，约 -1ms）；
  尾部峰值 6.3–6.8ms → 5.0–5.5ms；全量冷渲染均值 34.5ms → 31.1ms。
- **两版本尾部均仍 >4ms，未达成单帧 ≤4ms**。（原设定目标 ≤4ms 未通过。）
- 该差值来自 `markdown.js` 缓存键改动（P0-2 部分）：不再对每个块做 `JSON.stringify(token)`
  深序列化，改为 `type + raw`，并以 `links` 签名控制跨块复用。
- 本微基准**只调用 `renderMarkdown`，不经过 `stream-renderer.js` 的 40ms 节流**；
  节流只减少绘制次数，不降低单次成本，其收益**不计入**本组单帧差值。

## 四、环境与跨环境限制

| 项 | 本轮 | 原基线 |
| --- | --- | --- |
| UA | HeadlessChrome/148（Playwright，headless） | Chromium 152 |
| 硬件 | hardwareConcurrency 16 / deviceMemory 32 | hardwareConcurrency 16 / deviceMemory 32 |
| 本机 baseline 尾部 | 5.73ms | 原基线记录 7–12ms |

本机 baseline 尾部低于原基线记录，说明**本轮与原基线不是同一环境**（浏览器版本、headed/headless、
机器状态不同），因此原基线 7–12ms 不可作为本轮对照，只能用同轮 baseline/current 配对差值。
原基线数值未被改写，亦不声称本轮复现了原样本。

## 五、复现

```sh
PLAYWRIGHT_PATH=<.../playwright/index.mjs> CHROMIUM_EXE=<.../chrome.exe> \
node docs/perf-long-conversation/stream-microbench.mjs \
  --jsonl <会话 JSONL 隔离副本路径> \
  --baseline <c7cf8a5 的 public 目录> --current <当前工作树 public 目录> \
  --runs 3 --chars 43645 --chunk 600 --tail 4
```

脚本只读 JSONL，样本文本仅在内存传递，不落盘、不打印。`--baseline/--current` 目录需含
`markdown.js` 与其同级 `vendor/{marked,purify}.js`（静态服务中即 `/vendor` 的两个映射文件）。
