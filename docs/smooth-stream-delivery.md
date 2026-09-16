# 平滑流式显示交付记录

日期：2026-09-15；基线 ab52936；独立分支 feat/smooth-stream。

## 实现与接线

```text
WS / 唯一归并 -> raw / rawLive（立即完整）
                       |
                 prepareStream（合并去标签）
                       |
              item 对象 + generation
                       |
        单个共享 rAF -> 字素游标 -> Text 节点
                       |
              afterPaint -> 原布局/滚动层
```

- `public/stream-playback.js` 纯时钟状态机；150ms 起播，10 字素/秒基准，近期到达速度 EWMA，1s 目标滞后，200 字素/秒上限；积压超过 200 字素直接对齐，每帧最多 120 字素。最后一个字素静默 300ms 可显示；不完整高代理项等待后批补全。终态直接对齐，不等待动画。
- 字符串只保留最新权威引用，不积累 delta/正文副本；最多 24,000 UTF-16 码元在输入改变时完整 Intl.Segmenter 分段。特意不用固定尾窗处理 RI 奇偶/任意组合尾部。缺 Segmenter 或超长整批展示。
- `stream-renderer.js` 删除原浏览器 40ms timeout 绘制路径，统一 rAF；无 rAF 的 Node 宿主才使用 timeout 替身。dirty Set 同时承载真实变更与尚未追平项，不添加第二个播放队列或业务 reducer。保留 520ms 交互让路及 1s 饥饿截止，6ms 后在消息之间让出。
- 普通单段白名单内容用同一个 Text 节点更新，完全不运行 marked；Markdown 转换仍用原 marked/DOMPurify，晚到引用定义仍全文 lex，不把空行当永久稳定。
- `app.js` 接入取消收口、旧回复销毁、页面 dispose、正文 aria-live=off；服务静态映射登记新模块。权威复制/历史、WS/seq、SDK、虚拟列表不变。

## 明确降级与尚未达到的性能目标

只对当前挂载主回复、无 Markdown/HTML/链接语法的普通单段内容平滑；换行、ASCII Markdown 标点、代码/表格/列表等走批量解析；子代理、历史、过程与思考不统一逐字播放。

复杂正文更新间隔至少 100ms，按上次耗时退让；超过 24,000 UTF-16 码元的所有 Markdown 调用（包括历史/终态）降级完整安全原文，并显示提示。这是明确的显示能力上限，不截断原文，不影响保存和复制。阈值以下的复杂文档仍可能同步卡顿，当前 marked/DOMPurify 不支持抢占：6ms 预算只在消息之间生效，**不是硬单帧预算**。浏览器实测复杂文档仍出现长任务，故没有声称全 Markdown 平滑或全部终态收尾符合帧预算。后续若要解决，需独立解析/分片 DOM 提交治理，而不是逐字重解析或切断引用语义。

## 生命周期/相邻分支约定

- 身份：当前 item 对象本身稳定；`item.generation` 可选数字给同对象替换/修订。新回复创建新 item；snapshot 清空 renderer。未来稳定 messageId 的迁移由接入方统一，不按 sessionId+agentId 复用。
- 挂载：复用 node.isConnected、node.hidden、task.node.open；可由窗口层设置 item.mounted=false 并调用 disposeMessage(item)，同时释放游标和调度。重挂已绘制项直接对齐；不管理窗口/历史页。
- 测高：仅 afterPaint 通知，当前接 scrollLatest；不自行 scrollTop/测高/修改阅读锚点。
- hidden：取消帧、销毁游标；回来对齐。reduced-motion 动态变更取消旧帧并对齐。选区存在时不改节点，选区释放后继续；选区或隐藏时 DOM 可延后，但终态/权威数据已经完整。
- clear/dispose/flush 帧代际守卫保证旧回调不污染下一回复；dispose 解绑 visibilitychange/selectionchange/media listener 和局部引用。

## 验证与性能证据

基线通过 `git show ab52936:public/markdown.js` 加真实 marked/DOMPurify/JSDOM 重放同样 5 批 ×10字：5 次全文 lexer、5 次视觉更新（每批直接贴完）。源码调度为首标记后 40ms timeout，100 次 mark 合并一次解析；旧交互让路测试保留。

最终 Node 全量：628 项，626 通过、2 项既有跳过、0 失败（约 54.8s）。字素测试包括逐 UTF-16 码元跨批、随机 emoji/ZWJ/组合/旗帜、长 RI 与 300 个组合字符尾部；DOM 测试包括实际 Markdown、安全原文、选区、动态 reduced-motion、hidden、unmount、旧回调与完整权威文本。已有标签/页面测试改为明确 reduced-motion 环境，不改变原断言。

隔离 Chromium，1280×720，4 倍 CPU 节流，串行纯静态实例，不连接模型/业务 WS；机器为当前 Windows 开发环境，结果只代表此运行环境，不是通用性能保证。完整证据见 `docs/perf-smooth-stream.json`。

| 场景 | 字符数 | 绘制次数 | rAF p95 / max | 长任务 | 峰值待显 UTF-16 |
|---|---:|---:|---:|---:|---:|
| 10字/秒 ×5批 | 50 | 40 | 16.7 / 16.8ms | 0 | 12 |
| 复杂 Markdown 突发 | 3444 | 5 | 49.9 / 266.7ms | 2，总342ms | 1293 |
| 超长安全原文 | 30000 | 6 | 33.4 / 50.0ms | 1，总54ms | 5000 |

普通文本 lexer=0；复杂场景及超长场景实际次数以 JSON 的 lexes 为准。所有场景最终完整，无残留 pending；输入停止后的滚动/按键均20/20响应，p95 分别18.7/17.9ms。此脚本测量的是**输入停止后**的交互，尚不构成复杂 Markdown 卡顿期间输入/停止按钮响应的证明；未实测真实 app 的停止按钮或菜单节点稳定性，不夸大验收范围。

可复现：

```sh
npm test
python tests/smooth-stream-browser.py --out docs/perf-smooth-stream.json
```

本轮保留 worktree，不集成/推送 master。
