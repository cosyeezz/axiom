# 输入框缓存后的 profile：诊断记录，不计性能验收

## 证据状态

本次采集发生并发运行，同名 JSON 被覆盖。当前 `profile-prompt-cache.json` 内部数值自洽，指向 `axiom-profile-current-SwcAvZ/raw-profiles`；另一份 `axiom-profile-current-PIEDXg/raw-profiles` 的 trace 仍在临时目录。**不得用本次数据判定稳定收益或完成三次性能验收。** 原始 JSON、旧报告和脚本均保留。

独立只读核查确认：当前 JSON 包含一次测量加载与一次独立强制布局探针加载；旧 `profile-current-hotspots.json` 包含三次测量加载，但也只有一次探针加载。下面探针对比是一次对一次，不是三次对三次。

## 当前 JSON 中可核对的数据

| 指标 | 当前记录 |
|---|---:|
| DOM 节点 / 消息元素 / output 子节点 | 41655 / 143 / 92 |
| 测量加载长任务 A / B | 432 / 378ms |
| 对应 trace 顶层任务 A / B | 432.7 / 378.5ms |
| 探针加载长任务 A / B | 437 / 376ms |
| 探针 >1ms 慢读合计 | 16.9ms |
| scrollToLatest 慢读 | 10.9ms / 2 次，最大 8ms |
| stack-unavailable 慢读 | 6ms / 1 次 |
| 任务 B 的 Layout / UpdateLayoutTree | 309.5 / 38.3ms |
| 任务 B 的 `(program)` 采样自耗 | 363.4ms |

页面 longtask 与 trace 交叉检查匹配；完成后 1.5 秒的计数复核不变。消息元素计数不等于历史消息总数，不据此宣称完整历史已验证。

当前 JSON 中 app.js hash 为 `01af9c3b…756f0c6b`，独立核查时与工作树一致；markdown.js 为 `30205bbf…97cea1`，stream-renderer.js 为 `68b0c041…8d91ef`。样本 JSONL hash 为 `6dfedb20…c7cf1`，12,394,998 字节，与旧 JSON 相同。

## 慢读统计的边界

探针仅记录耗时 **>1ms** 的读取，站点键含函数名和行号。本次未记录到 `resizePrompt` 的 >1ms 站点读，**不等于读取次数为零，也不能证明同步布局完全消失**。另有一次 6ms 的无栈读取，无法据本数据确定其调用来源。

旧 JSON 的单次探针记录：resizePrompt 389.6ms / 2 次（最大 384ms），scrollToLatest 12.4ms / 2 次，慢读合计 402ms。由于本次并发污染，不能将 402→16.9ms 表述为已确认的优化收益。

任务 B 仍包含约 310ms Layout。其 `(program)` 采样没有 JS 父帧，但任务内仍有 refreshCallGroups、paintCallGroup 等 JS 采样，不能写成“任务内无任何 JS 栈”。“布局成本由同步读取转移到浏览器帧内”仅作为待清洁采集验证的解释。

## 旧报告与旧 JSON 不一致

以下采用旧 JSON 原始记录，不混用旧 Markdown 报告区间：

| 指标 | 旧 JSON 三次测量 |
|---|---|
| 长任务 A | 438 / 441 / 478ms |
| 长任务 B | 429 / 438 / 399ms |
| resizePrompt 采样自耗 | 362.3 / 404.6 / 408.4ms |
| 任务 B Layout | 320.6 / 344.6 / 372ms |
| 任务 A `(program)` 自耗 | 260.5 / 260.1 / 281.6ms |
| beginSnapshot 自耗 | 150.3 / 154.8 / 160.9ms |

旧 Markdown 所写的“两次运行”、348.5–372.2ms 等组成值与旧 JSON 不一致。**仅凭文件差异不能断定旧采集也发生并发覆盖**；原因未查明，不以旧 Markdown 组成值作为量化对照。

## 被覆盖运行与资源记录

- 独立核查从 PIEDXg 的原始 trace 复现了 435.258 / 392.712ms 顶层任务，支持存在另一份运行。不能混入当前 JSON 的 378ms 点值形成区间。
- 子任务曾报告 PIEDXg 探针慢读 18.6ms、无 resizePrompt 慢读，但对应 JSON 已被覆盖，无留档可核对，不计证据。
- PIEDXg 的代码 hash 随 JSON 丢失，不能直接证明两次 hash 相同；文件修改时间早于两次运行仅是旁证。
- 脚本 finally 调用 browser.close() 与服务进程 kill()，但不自动删除临时目录，server.log 文件描述符也未显式关闭。这些清理调用不等于已证明所有退出路径均有界。
- 主代理后续按 profile-current-hotspots/profile-prompt-cache/axiom-perf-profile 查询进程，仅匹配查询自身；这是限定名称的检查，不是全局无残留证明。未擅自结束其他进程。

## 结论与后续

现有记录中的长任务仍超过 200ms，不能宣布达标。输入框缓存的逻辑测试与独立复核通过，但性能收益未被本次受污染采集确认。

后续测量应串行执行、使用每次唯一输出路径并保存来源信息，核查有界清理后再启动。暂不重跑，不据本记录新增 CSS A/B、虚拟化或后端接口。
