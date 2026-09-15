"""隔离真实浏览器串行测量：平滑流式渲染（真实 public/markdown.js + public/stream-renderer.js）。

- 只由 tests/smooth-stream-preview.mjs 提供 public/ 与内置测试页，loopback 随机端口；
  不启动业务服务、不开业务 WebSocket（页面内把 WebSocket 计数）、不调用模型、不触碰 4319。
- Chromium 固定 4 倍 CPU 节流，场景严格串行：
  1) 纯文本 10 字/秒 × 5 批 → flush；
  2) 复杂 Markdown 突发（标题/表格/代码/列表/引用）；
  3) >24000 UTF-16 超长安全原文（literal 路径）。
- 页面内记录：rAF 帧间隔、longtask、renderMarkdown 调用次数（保留 isPlainText 属性）、paint 次数、
  pending UTF-16 峰值与 p50/p95/max、末文完整性；输入停止后再测滚动 / 按键响应。
- 结果 JSON 打印到 stdout；用 --out 或 ARTIFACT 指定文件同时落盘。

需要：Python Playwright + Chromium、node、worktree 内 node_modules（vendor 前端库）。
运行：python tests/smooth-stream-browser.py [--out report.json] [--port 0]
"""

import argparse
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
PREVIEW = HERE / "smooth-stream-preview.mjs"
URL_LINE = re.compile(r"^SMOOTH-STREAM-PREVIEW (\S+)$")
CPU_THROTTLE = 4
ROUNDS = 20

# 与 tests/smooth-stream-preview.mjs 的 sourceFor/run 约定对应（只传数据，不传函数）。
SPECS = [
    {"name": "plain-10cps-5batches", "kind": "stream", "charsPerBatch": 10, "batches": 5, "intervalMs": 1000},
    {"name": "burst-complex-markdown", "kind": "burst", "sections": 12, "bursts": 8, "burstMs": 90,
     "markers": ["M%03d" % i for i in range(1, 13)]},
    {"name": "literal-over-24000", "kind": "long", "chars": 30000, "bursts": 6, "burstMs": 120},
]


def start_preview(port):
    env = dict(os.environ, PORT=str(port))
    proc = subprocess.Popen(
        [os.environ.get("NODE", "node"), str(PREVIEW)], cwd=str(REPO), env=env,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding="utf-8", errors="replace",
    )
    deadline = time.time() + 30
    while time.time() < deadline:
        line = proc.stdout.readline()
        if not line:
            break
        found = URL_LINE.match(line.strip())
        if found:
            return proc, found.group(1)
    proc.kill()
    raise RuntimeError("预览服务未就绪：" + (proc.stderr.read() or "")[:800])


def stop_preview(proc):
    if proc.poll() is not None:
        return
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()


def run_checks(report):
    checks = []

    def check(name, ok, detail=""):
        checks.append({"name": name, "pass": bool(ok), "detail": "" if ok else str(detail)[:300]})

    check("页面无脚本错误", not report["errors"], report["errors"][:3])
    check("isPlainText 属性保留", all(s["isPlainTextPreserved"] for s in report["scenarios"]))
    check("未创建任何 WebSocket", all(s["sockets"] == 0 for s in report["scenarios"]), [s["sockets"] for s in report["scenarios"]])
    for scenario in report["scenarios"]:
        check("%s：末文完整" % scenario["name"], scenario["finalTextComplete"],
              "%s/%s 字" % (scenario["finalRenderChars"], scenario["chars"]))
        check("%s：flush 后无残留 pending" % scenario["name"], scenario["settled"])
        if scenario["kind"] != "burst":
            check("%s：DOM 文本与原文一致" % scenario["name"], scenario["domTextComplete"])
    burst = next(s for s in report["scenarios"] if s["kind"] == "burst")
    check("复杂 Markdown：标记齐全", not burst["missingMarkers"], burst["missingMarkers"])
    check("复杂 Markdown：表格与代码块已渲染", burst["domTags"]["table"] >= 12 and burst["domTags"]["code"] >= 12, burst["domTags"])
    literal = next(s for s in report["scenarios"] if s["kind"] == "long")
    check("超长原文：literal 提示与 pre 容器", literal["literalNotice"] and literal["domTags"]["pre"] >= 1, literal["domTags"])
    response = report["responsiveness"]
    check("交互：滚动与按键均有响应", response["scrolled"] > 0 and response["scrollEvents"] > 0 and response["keyHandled"] == response["rounds"], response)
    check("交互：flush 后内容已完整绘制", response["paintedComplete"])
    report["checks"] = checks
    return checks


def summarize(report):
    lines = []
    for scenario in report["scenarios"]:
        lines.append(
            "%-22s chars=%-6d renderCalls=%-4d paints=%-4d frames p50/p95/max=%.1f/%.1f/%.1fms "
            "pendingUTF16 peak=%d p50=%.1f p95=%.1f max=%.0f longtask=%d(%.0fms) 完整=%s"
            % (scenario["name"], scenario["chars"], scenario["renderCalls"], scenario["paints"],
               scenario["frames"]["p50"], scenario["frames"]["p95"], scenario["frames"]["max"],
               scenario["pendingUtf16"]["peak"], scenario["pendingUtf16"]["p50"], scenario["pendingUtf16"]["p95"],
               scenario["pendingUtf16"]["max"], scenario["longtasks"]["count"], scenario["longtasks"]["totalMs"],
               scenario["finalTextComplete"]))
    response = report["responsiveness"]
    lines.append("interaction            scrollEvents=%d keyHandled=%d scrollHeight=%d "
                 "scroll p95=%.1fms key p95=%.1fms"
                 % (response["scrollEvents"], response["keyHandled"], response["scrollHeight"],
                    response["scrollLatency"]["p95"], response["keyLatency"]["p95"]))
    return lines


def main():
    parser = argparse.ArgumentParser(description="隔离浏览器串行测量：平滑流式渲染")
    parser.add_argument("--out", default=os.environ.get("ARTIFACT") or os.environ.get("SMOOTH_STREAM_ARTIFACT"),
                        help="结果 JSON 落盘路径（默认只打印到 stdout）")
    parser.add_argument("--port", type=int, default=0, help="预览端口，0 = loopback 随机端口")
    args = parser.parse_args()

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("FAIL 需要 Python Playwright：pip install playwright && playwright install chromium")
        return 2

    report = {"cpuThrottle": CPU_THROTTLE, "rounds": ROUNDS, "specs": SPECS,
              "scenarios": [], "responsiveness": {}, "errors": [], "checks": []}
    proc, url = start_preview(args.port)
    report["url"] = url
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(args=["--disable-gpu"])
            try:
                page = browser.new_page(viewport={"width": 1280, "height": 720})
                page.set_default_timeout(180000)
                client = page.context.new_cdp_session(page)
                client.send("Emulation.setCPUThrottlingRate", {"rate": CPU_THROTTLE})
                errors = []

                def on_pageerror(error):
                    errors.append("pageerror: %s" % error)

                def on_console(message):
                    if message.type == "error":
                        errors.append("console: %s" % message.text)

                page.on("pageerror", on_pageerror)
                page.on("console", on_console)
                page.goto(url)
                page.wait_for_function("() => window.harness && window.harness.ready")
                for spec in SPECS:  # 严格串行
                    report["scenarios"].append(page.evaluate("(spec) => window.harness.run(spec)", spec))
                report["responsiveness"] = page.evaluate("(rounds) => window.harness.responsiveness(rounds)", ROUNDS)
                report["errors"] = errors
            finally:
                browser.close()
    finally:
        stop_preview(proc)

    checks = run_checks(report)
    for line in summarize(report):
        print(line)
    for item in checks:
        print(("PASS " if item["pass"] else "FAIL ") + item["name"] + ("" if item["pass"] else " -> " + item["detail"]))
    payload = json.dumps(report, ensure_ascii=False, indent=2)
    if args.out:
        Path(args.out).write_text(payload + "\n", encoding="utf-8")
        print("ARTIFACT " + str(Path(args.out).resolve()))
    print(payload)
    return 0 if all(item["pass"] for item in checks) else 1


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main())
