"""渲染容量验收（Phase D1/D2）：有界 DOM 滑动窗口 + 页缓存回载，真实 Chromium。

Run: python tests/render-capacity-ui.py
环境变量：CAPACITY_COUNT（默认 500）
Requires the existing Python Playwright + Chromium installation.

- 造数：源码注入法（同 tests/activity-groups-ui.py）——在 conversation-preview.mjs
  源码里注入一条 500 条混合消息会话，并给 sessions stub 挂上真实 src/session-history.js
  的 pageOf/createHistory 分页（attach window / session.history / target 定位全走真实游标语义）。
- 验证：attach 链式前插到最早页（顶部预取循环），挂载窗口封顶 300（D1）；滚回底部走
  target 整页重挂，被裁区间回来（D1 裁剪端回载闭环）；4× CPU 节流下滚动/按键响应；
  全展开懒渲染后的 DOM 容量口径；全程无 pageerror。
- 口径坑：思考/工具是懒渲染，details 未 open 不在 DOM——容量计数在「全展开」后取。
"""
from pathlib import Path
import json
import os
import socket
import subprocess
import sys
import time
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
preview = (root / "tests/conversation-preview.mjs").read_text(encoding="utf-8")
preview = preview.replace("../src/server.js", (root / "src/server.js").as_uri())

COUNT = int(os.environ.get("CAPACITY_COUNT", "500"))
INJECT = """
import { createHistory, pageOf, toPageRecord } from "__SESSION_HISTORY__";
const COUNT = __COUNT__;
const capacityRecords = [];
for (let i = 0; i < COUNT; i++) {
  const entryId = `cap-${i}`;
  if (i % 4 === 0) capacityRecords.push({ agentId: "main", entryId, message: { role: "user", content: `第 ${i} 轮：请继续分析并给出结论。` } });
  else if (i % 4 === 1) capacityRecords.push({ agentId: "main", entryId, message: assistant([
    { type: "text", text: `## 结论 ${i}\\n\\n**要点**：内容与顺序都应当稳定。\\n\\n- 项目甲 ${i}\\n- 项目乙 ${i}\\n\\n\\`inline-${i}\\` 与段落文字，重复若干次以模拟真实密度。` } ]) });
  else if (i % 4 === 2) capacityRecords.push({ agentId: "main", entryId, message: assistant([
    { type: "thinking", thinking: `思考 ${i}：先分解，再合并。` },
    { type: "toolCall", id: `t-${i}`, name: "read", arguments: { path: `file-${i}.txt` } } ]) });
  else capacityRecords.push({ agentId: "main", entryId, message: { role: "toolResult", toolCallId: `t-${i-1}`, toolName: "read", content: [{ type: "text", text: `工具结果 ${i}：内容行。` }] } });
}
const capacityHistory = createHistory("ui-capacity");
const capacityBase = {
  sessionId: "ui-capacity", title: "渲染容量验收", cwd: process.cwd(), status: "idle",
  config: { model: "preview/axiom", thinking: "high", levels: ["off", "high"], skills: [] },
  tasks: [], compactions: [], retries: [], live: {}, tools: {}, questions: [],
};
const capacityPage = (page) => ({ ...capacityBase,
  messages: page.records.map(toPageRecord),
  instanceId: capacityEpoch, revision: capacityHistory.revision, history: page.meta, liveMessageIds: {} });
let capacityEpoch = null;
states.push(capacityBase);
""".replace("__SESSION_HISTORY__", (root / "src/session-history.js").as_uri()).replace("__COUNT__", str(COUNT))
# stub：快照/分页（只对 ui-capacity 走真实分页，其余会话保持原行为）。
# 注意：原源码对象字面量后面的同名键会覆盖前面的，所以 snapshot 必须原地替换而不是追加。
preview = preview.replace("const sessions = {", INJECT + "\nconst sessions = {")
preview = preview.replace("  snapshot: (id) => sessions.get(id),", """
  snapshot: (id, opts = {}) => {
    const s = sessions.get(id);
    if (id !== "ui-capacity" || !opts?.window) return s;
    capacityEpoch = opts.epoch ?? capacityEpoch;
    const page = pageOf(capacityRecords, capacityHistory, { sessionId: id, epoch: capacityEpoch, ...opts.window });
    return structuredClone(capacityPage(page));
  },
  history: (id, request) => {
    const page = pageOf(capacityRecords, capacityHistory, {
      sessionId: id, epoch: request.instanceId ?? capacityEpoch,
      before: request.before, after: request.after, target: request.target, limit: request.limit,
    });
    return structuredClone(capacityPage(page));
  },
""")

with socket.socket() as sock:
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
server = subprocess.Popen(["node", "--input-type=module", "-e", preview], cwd=str(root),
                          env={**os.environ, "PREVIEW_PORT": str(port)},
                          stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)

failures = []
def report(name, ok, detail=""):
    print(("PASS " if ok else "FAIL ") + name + (f"  {detail}" if detail else ""))
    if not ok:
        failures.append(name)
    return ok

def stats(values):
    if not values:
        return {"p50": 0, "p95": 0, "max": 0}
    ordered = sorted(values)
    def pick(q):
        return ordered[min(len(ordered) - 1, int(q * (len(ordered) - 1)))]
    return {"p50": round(pick(0.5), 1), "p95": round(pick(0.95), 1), "max": round(pick(1), 1)}

METRICS = """() => {
    const output = document.getElementById('output');
    return {
        domNodes: document.querySelectorAll('*').length,
        outputNodes: output.querySelectorAll('*').length,
        messages: output.querySelectorAll('.message').length,
        details: output.querySelectorAll('details').length,
        outputTextChars: output.textContent.length,
        scrollHeight: document.getElementById('transcript').scrollHeight,
        position: document.getElementById('history-position').textContent,
    };
}"""

INTERACT = """async (rounds) => {
    const SCROLL = document.getElementById('transcript');
    const scrollLatency = [], keyLatency = [];
    let scrollEvents = 0;
    const onScroll = () => { scrollEvents += 1; };
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    for (let i = 0; i < rounds; i++) {
        const sAt = performance.now();
        // 每轮必须真的换位置：相对位移在已到顶的窗口里恒为 0，不会产生 scroll。
        SCROLL.scrollTop = 200 + (i % 2) * 600;
        scrollLatency.push(performance.now() - sAt);
        const kAt = performance.now();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
        keyLatency.push(performance.now() - kAt);
    }
    // scroll 是异步派发（下一帧前合并）：同步循环结束就摘监听器会计数恒 0。
    await new Promise((resolve) => setTimeout(resolve, 300));
    document.removeEventListener('scroll', onScroll, { capture: true });
    return { scrollEvents, scrollLatency, keyLatency };
}"""

metrics, errors, ready_ms = {}, [], 0.0
try:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.context.new_cdp_session(page).send("Emulation.setCPUThrottlingRate", {"rate": 4})
        started = time.perf_counter()
        for _ in range(40):
            try:
                page.goto(f"http://127.0.0.1:{port}/#session=ui-capacity")
                break
            except Exception:
                time.sleep(0.2)
        page.wait_for_selector("#workspace:not([hidden])")
        page.wait_for_selector("#output .message")
        ready_ms = (time.perf_counter() - started) * 1000
        # 主动滚到顶部触发顶部预取；attach 后 rAF 链式前插（scrollTop≈0 满足条件）继续。
        page.evaluate("() => { const t = document.getElementById('transcript'); t.scrollTop = 0; t.dispatchEvent(new Event('scroll')); }")
        # 前插链式推进（每页后 scrollTop 补偿仍近顶），等待抵达最早页且挂载稳定。
        for _ in range(40):
            page.evaluate("() => { document.getElementById('transcript').scrollTop = 0; }")
            try:
                page.wait_for_function(
                    "() => document.getElementById('history-position').textContent.startsWith('1–')",
                    timeout=4000)
                break
            except Exception:
                pass
        else:
            report("前插抵达最早页", False,
                   page.evaluate("() => document.getElementById('history-position').textContent"))
        page.wait_for_timeout(800)
        attach = page.evaluate(METRICS)
        report(f"attach→ready+前插到顶 {round(ready_ms)}ms", True, f"position={attach['position']}")

        # D1：挂载窗口封顶（500 条会话只挂 300 条窗口）。
        limit = 300 + 12  # 窗口上限 + 通知/重试卡等少量杂项余量
        report(f"D1 挂载窗口有界 messages <= {limit}",
               attach["messages"] <= limit,
               f"messages={attach['messages']} position={attach['position']}")

        # D1/D2 回载闭环：滚回底部触发 target 整页重挂，被裁区间回来。
        # 程序化赋 scrollTop 在部分情形下不会同步跑到监听器，手动派发一次。
        page.evaluate("""() => {
          const el = document.getElementById('transcript');
          el.scrollTop = el.scrollHeight;
          el.dispatchEvent(new Event('scroll'));
        }""")
        page.wait_for_function(
            "() => { const t = document.getElementById('history-position').textContent; return t && !t.startsWith('1–'); }",
            timeout=60000)
        page.wait_for_timeout(600)
        bottom = page.evaluate(METRICS)
        # target 整页重挂以被裁第一条定位，服务端返回包含它的窗口（此处 241–360）；
        # 关键不变量：窗口整体替换而非叠加，且不再是最早窗口。
        report("D1 裁剪端回载闭环（滚底 target 重挂）",
               bottom["messages"] < attach["messages"] and not bottom["position"].startswith("1–"),
               f"messages={bottom['messages']} position={bottom['position']!r}")
        # 被裁区间回来了：裁剪边界 cap-300（300 % 4 == 0 → user 卡）重新在场。
        tail = page.evaluate(
            "() => document.getElementById('output').textContent.includes('第 300 轮')")
        report("被裁边界条目回载后在场", tail, "cap-300 内容在场")

        # 交互响应（4× 节流）：滚动与按键。
        response = page.evaluate(INTERACT, 40)
        scroll = stats(response["scrollLatency"]); key = stats(response["keyLatency"])
        report("交互响应（4× 节流）", response["scrollEvents"] > 0,
               f"scroll p50/p95={scroll['p50']}/{scroll['p95']}ms key p50/p95={key['p50']}/{key['p95']}ms")

        # 全展开口径：懒渲染内容只有 open 后才进 DOM。
        page.evaluate("() => document.querySelectorAll('#output details').forEach((d) => { d.open = true; })")
        page.wait_for_timeout(700)
        expanded = page.evaluate(METRICS)
        report("全展开后 DOM 有界（300 窗口口径）",
               expanded["messages"] <= limit,
               f"domNodes={expanded['domNodes']} outputNodes={expanded['outputNodes']} details={expanded['details']}")

        metrics = {"attach": attach, "bottom": bottom, "expanded": expanded,
                   "scroll": scroll, "key": key, "readyMs": round(ready_ms)}
        browser.close()
finally:
    server.terminate()
    server.wait(timeout=10)
    leftover = server.stderr.read().decode("utf8", "ignore")[-2000:]
    if "Error" in leftover:
        print("preview stderr tail:\n" + leftover)

report("无页面错误", not errors, "; ".join(errors[:2]))
print(json.dumps({"count": COUNT, "pageErrors": errors, **metrics}, ensure_ascii=False, indent=2))
sys.exit(1 if failures else 0)
