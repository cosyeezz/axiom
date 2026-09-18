"""渲染容量验收：整份历史一次挂载 + 页缓存复用，真实 Chromium。

Run: python tests/render-capacity-ui.py
环境变量：CAPACITY_COUNT（默认 500）
Requires the existing Python Playwright + Chromium installation.

- 造数：源码注入法（同 tests/activity-groups-ui.py）——在 conversation-preview.mjs
  源码里注入一条 500 条混合消息会话，sessions stub 用真实 src/session-history.js 的
  toWireRecord 投影，attach 一次下发全部记录（分页已删除，无 window/游标语义）。
- 验证：attach 后 500 条全部在场且首尾齐；回最早/回最新是纯本地跳转（不取数、不重建
  节点）；4× CPU 节流下滚动/按键响应；全展开懒渲染后的 DOM 容量口径；全程无 pageerror。
- 口径坑：思考/工具是懒渲染，details 未 open 不在 DOM——容量计数在「全展开」后取。
- 已知边界：整份挂载下 DOM 规模随会话长度线性增长，本脚本记录实测数值而不断言硬上限；
  生产上靠上下文自动压缩（折叠段不下发）控制规模。
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
import { toWireRecord } from "__SESSION_HISTORY__";
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
const capacityBase = {
  sessionId: "ui-capacity", title: "渲染容量验收", cwd: process.cwd(), status: "idle",
  config: { model: "preview/axiom", thinking: "high", levels: ["off", "high"], skills: [] },
  tasks: [], compactions: [], retries: [], live: {}, tools: {}, questions: [],
};
// 整份下发：messages 是全部记录，messageIndexes/messageCount 按折叠前历史下标给出。
const capacityFull = () => ({ ...capacityBase,
  messages: capacityRecords.map(toWireRecord),
  messageIndexes: capacityRecords.map((_, i) => i + 1),
  messageCount: capacityRecords.length,
  instanceId: "capacity", liveMessageIds: {} });
states.push(capacityBase);
""".replace("__SESSION_HISTORY__", (root / "src/session-history.js").as_uri()).replace("__COUNT__", str(COUNT))
# stub：只对 ui-capacity 返回整份注入历史，其余会话保持原行为。
# 注意：原源码对象字面量后面的同名键会覆盖前面的，所以 snapshot 必须原地替换而不是追加。
preview = preview.replace("const sessions = {", INJECT + "\nconst sessions = {")
preview = preview.replace("  snapshot: (id) => sessions.get(id),", """
  snapshot: (id) => (id === "ui-capacity" ? structuredClone(capacityFull()) : sessions.get(id)),
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
        requests = []
        # sync API 的 framesent 直接给 payload 字符串（不是带 .payload 的对象）。
        page.on("websocket", lambda ws: ws.on("framesent", lambda payload: requests.append(str(payload))))
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
        # toolResult 并入前一条 toolCall 卡片，不单独成 .message：预期数按此扣除。
        expected_messages = COUNT - COUNT // 4
        page.wait_for_function(f"() => document.querySelectorAll('#output .message').length >= {expected_messages}",
                               timeout=60000)
        ready_ms = (time.perf_counter() - started) * 1000
        page.wait_for_timeout(600)
        attach = page.evaluate(METRICS)
        report(f"attach→整份挂载 {round(ready_ms)}ms", True, f"messages={attach['messages']}")

        # 整份下发：500 条一次到位，首尾都在场，没有分页补齐请求。
        report(f"整份历史全部在场 messages == {expected_messages}",
               attach["messages"] == expected_messages, f"messages={attach['messages']}")
        ends = page.evaluate("""() => {
          const text = document.getElementById('output').textContent;
          return { first: text.includes('第 0 轮'), last: text.includes('第 496 轮') };
        }""")
        report("首尾两端齐（无窗口裁剪）", ends["first"] and ends["last"], json.dumps(ends))
        attach_requests = [r for r in requests if '"session.attach"' in r]
        report("attach 只发一次且无历史补齐请求",
               len(attach_requests) == 1 and not any('"session.history"' in r for r in requests),
               f"attach={len(attach_requests)} total={len(requests)}")

        # 回最早/回最新是纯本地跳转：不取数、不重建节点。
        page.evaluate("() => { window.__capNode = document.querySelector('#output .message'); }")
        before_jump = len(requests)
        page.click("#earliest")
        page.wait_for_function("() => document.getElementById('transcript').scrollTop < 200", timeout=15000)
        top = page.evaluate("() => document.getElementById('transcript').scrollTop")
        # 回最新走 rAF + 贴底门限，4× 节流下收敛慢，轮询而不是固定等待。
        page.click("#latest")
        page.wait_for_function("() => document.getElementById('transcript').scrollTop > 1000", timeout=15000)
        bottom_scroll = page.evaluate("() => document.getElementById('transcript').scrollTop")
        after = page.evaluate(METRICS)
        report("回最早/回最新纯本地跳转（不取数、不重建节点）",
               len(requests) == before_jump and page.evaluate("() => window.__capNode.isConnected")
               and after["messages"] == expected_messages and top < 200 < bottom_scroll,
               f"top={round(top)} bottom={round(bottom_scroll)} requests+{len(requests) - before_jump}")

        # 交互响应（4× 节流）：滚动与按键。
        response = page.evaluate(INTERACT, 40)
        scroll = stats(response["scrollLatency"]); key = stats(response["keyLatency"])
        report("交互响应（4× 节流）", response["scrollEvents"] > 0,
               f"scroll p50/p95={scroll['p50']}/{scroll['p95']}ms key p50/p95={key['p50']}/{key['p95']}ms")

        # 全展开口径：懒渲染内容只有 open 后才进 DOM。记录实测规模，不断言硬上限。
        page.evaluate("() => document.querySelectorAll('#output details').forEach((d) => { d.open = true; })")
        page.wait_for_timeout(900)
        expanded = page.evaluate(METRICS)
        report("全展开后消息数不变（懒渲染只补详情）",
               expanded["messages"] == expected_messages,
               f"domNodes={expanded['domNodes']} outputNodes={expanded['outputNodes']} details={expanded['details']}")

        metrics = {"attach": attach, "afterJump": after, "expanded": expanded,
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
