"""真实 Chromium 验收：由脚本自己拉起 tests/goal-preview.mjs（干净状态，可重复运行）。

覆盖面：普通会话不出现目标面板；待确认 / 执行中 / 已暂停三种阶段；轮次折叠不丢消息；
暂停只发 goal.action；桌面与 390px 无横向溢出、无控制台错误。截图写到临时目录（不入库）。

用法：python tests/goal-ui.py
"""
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

REPO = Path(__file__).resolve().parent.parent
ARTIFACTS = Path(os.environ.get("AXIOM_GOAL_ARTIFACTS", Path(tempfile.gettempdir()) / "axiom-goal-ui"))
ARTIFACTS.mkdir(parents=True, exist_ok=True)


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def start_preview():
    node = shutil.which("node")
    assert node, "找不到 node"
    port = free_port()
    log = ARTIFACTS / "goal-preview.log"
    handle = log.open("w", encoding="utf-8")
    process = subprocess.Popen(
        [node, "tests/goal-preview.mjs"], cwd=REPO,
        env={**os.environ, "PREVIEW_PORT": str(port)},
        stdout=handle, stderr=subprocess.STDOUT, text=True,
    )
    url = f"http://127.0.0.1:{port}"
    deadline = time.time() + 30
    while time.time() < deadline:
        if process.poll() is not None:
            raise RuntimeError(f"预览进程提前退出：\n{log.read_text(encoding='utf-8')}")
        try:
            with urllib.request.urlopen(f"{url}/", timeout=1) as response:
                if response.status == 200:
                    return process, handle, url
        except (urllib.error.URLError, ConnectionError, TimeoutError):
            time.sleep(0.2)
    raise RuntimeError("预览服务 30s 内未就绪")


def overflow(page):
    return page.evaluate(
        """() => {
          const offenders = [...document.querySelectorAll('*')]
            .filter((node) => node.getBoundingClientRect().right > innerWidth + 1)
            .slice(0, 5)
            .map((node) => `${node.tagName}.${node.className}`.slice(0, 80));
          return { doc: document.documentElement.scrollWidth, body: document.body.scrollWidth,
                   win: innerWidth, offenders };
        }"""
    )


def assert_no_overflow(page, where, failures):
    metrics = overflow(page)
    if metrics["doc"] > metrics["win"] or metrics["body"] > metrics["win"]:
        failures.append(f"{where}: 横向溢出 {metrics}")


def open_session(page, session_id, title):
    page.locator(f'.session-row[data-session-id="{session_id}"] .session-item').click()
    page.wait_for_function(
        "(title) => document.getElementById('session-title').textContent === title",
        arg=title,
    )
    page.wait_for_timeout(250)


def check_plain_chat(page, failures):
    open_session(page, "chat-plain", "普通会话 · 无目标")
    assert page.locator("#goal-track").is_hidden(), "普通会话不该有目标进度条"
    assert page.locator("#goal-dock").is_hidden(), "普通会话不该有目标控制面板"
    assert page.locator("#goal-enter").is_visible(), "普通会话应保留目标入口图标"
    assert page.locator(".goal-round-head").count() == 0, "普通会话不该出现轮次分隔头"
    if page.locator(".message").count() == 0:
        failures.append("普通会话消息未渲染")
    page.screenshot(path=str(ARTIFACTS / "01-chat-desktop.png"))


def check_ready(page, failures):
    open_session(page, "goal-ready", "状态验收 · 待确认")
    assert page.locator("#goal-track").is_visible() and page.locator("#goal-dock").is_visible(), "待确认应显示目标面板"
    track = page.locator("#goal-track").inner_text()
    if "待确认" not in track:
        failures.append(f"待确认阶段文本缺失：{track[:120]!r}")
    if "把导出流程重构" not in track:
        failures.append("顶部条未显示计划确认后的目标原文")
    buttons = page.locator("#goal-dock button").all_inner_texts()
    if not any("确认计划" in item for item in buttons):
        failures.append(f"待确认缺少「确认计划」：{buttons}")
    # 计划卡：约束 / 验收标准 / 分轮计划都应有真实内容。
    page.locator("#goal-track .goal-plan-open").click()
    page.wait_for_selector("#goal-plan[open]")
    counts = page.evaluate(
        """() => ({ constraints: [...document.querySelectorAll('#goal-plan-constraints li')].length,
                    acceptance: [...document.querySelectorAll('#goal-plan-acceptance li')].length,
                    rounds: [...document.querySelectorAll('#goal-plan-rounds li.goal-plan-round')].length,
                    confirmHidden: document.getElementById('goal-plan-confirm').hidden })"""
    )
    if counts["constraints"] < 3 or counts["acceptance"] < 3 or counts["rounds"] != 3:
        failures.append(f"计划卡内容不完整：{counts}")
    if counts["confirmHidden"]:
        failures.append("待确认阶段计划卡未提供确认按钮")
    page.screenshot(path=str(ARTIFACTS / "02-ready-plan-dialog.png"))
    page.locator("#goal-plan-close").click()
    page.wait_for_selector("#goal-plan[open]", state="detached")
    assert_no_overflow(page, "待确认 1440", failures)


def round_text(page, index):
    return page.evaluate(
        """(index) => [...document.querySelectorAll('[data-goal-round]')]
             .filter((node) => node.dataset.goalRound === String(index))
             .map((node) => node.textContent).join('\\n')""",
        index,
    )


def check_running(page, failures, frames):
    open_session(page, "goal-running", "状态验收 · 执行中")
    assert page.locator("#goal-track").is_visible() and page.locator("#goal-dock").is_visible(), "执行中应显示目标面板"
    heads = page.locator(".goal-round-head")
    if heads.count() != 2:
        failures.append(f"轮次分隔头数量应为 2（已开始的两轮），实际 {heads.count()}")
    first = page.locator('.goal-round-head[data-round="0"]')
    if first.get_attribute("data-collapsed") != "true":
        failures.append("已完成的第 1 轮默认应处于折叠态")
    if first.locator(".goal-round-status").inner_text().strip() != "已完成":
        failures.append("第 1 轮状态应为已完成")
    folded = page.locator('[data-goal-round="0"]').first
    if folded.is_visible():
        failures.append("折叠后第 1 轮消息仍然可见")
    before = round_text(page, 0)
    for needle in ("调用点共 14 处", "out/baseline.json", "先只做梳理"):
        if needle not in before:
            failures.append(f"折叠态丢失消息内容：{needle}")
    page.screenshot(path=str(ARTIFACTS / "03-running-folded-desktop.png"))
    # 展开后原文必须逐字保留（折叠只是 display，不是删除）。
    first.locator(".goal-round-toggle").click()
    page.wait_for_timeout(120)
    if not folded.is_visible():
        failures.append("点击展开后第 1 轮消息仍不可见")
    after = round_text(page, 0)
    if after != before:
        failures.append("展开前后消息内容发生变化")
    page.screenshot(path=str(ARTIFACTS / "04-running-expanded-desktop.png"))
    assert_no_overflow(page, "执行中 1440", failures)

    # 390px：目标控制面板必须仍然可达，且不出现横向溢出。
    page.set_viewport_size({"width": 390, "height": 844})
    page.wait_for_timeout(250)
    if not page.locator("#goal-dock").is_visible():
        failures.append("390px 下目标控制面板不可见")
    if not page.locator("#goal-track").is_visible():
        failures.append("390px 下目标进度条不可见")
    dash = overflow(page)
    if dash["doc"] > dash["win"] or dash["body"] > dash["win"]:
        failures.append(f"390px 横向溢出 {dash}")
    page.screenshot(path=str(ARTIFACTS / "05-running-390.png"))
    page.set_viewport_size({"width": 1440, "height": 1000})
    page.wait_for_timeout(200)

    # 暂停：只应发出一次 goal.action，不得顺带发 prompt。
    mark = len(frames)
    page.locator("#goal-dock button", has_text="暂停").first.click()
    page.wait_for_timeout(500)
    sent = [json.loads(item) for item in frames[mark:] if item.strip().startswith("{")]
    kinds = [item.get("type") for item in sent]
    if kinds != ["goal.action"]:
        failures.append(f"暂停后发出的请求不止 goal.action：{sent}")
    elif sent[0].get("action") != "pause":
        failures.append(f"暂停请求动作错误：{sent[0]}")
    if any(item.get("type") in {"prompt", "session.retry", "cancel"} for item in sent):
        failures.append(f"暂停夹带了其他请求：{sent}")
    if "正在暂停" not in page.locator("#goal-dock").inner_text():
        failures.append(f"暂停后 UI 未进入暂停中：{page.locator('#goal-dock').inner_text()[:120]!r}")
    page.screenshot(path=str(ARTIFACTS / "06-running-pausing-desktop.png"))


def check_paused(page, failures):
    open_session(page, "goal-paused", "状态验收 · 已暂停")
    dock = page.locator("#goal-dock").inner_text()
    if "已暂停" not in dock:
        failures.append(f"暂停面板未显示阶段：{dock[:120]!r}")
    if "64 段预算" not in dock:
        failures.append(f"暂停原因未显示：{dock[:160]!r}")
    if "继续" not in dock:
        failures.append(f"已暂停缺少「继续」按钮：{dock[:160]!r}")
    page.screenshot(path=str(ARTIFACTS / "07-paused-desktop.png"))
    page.set_viewport_size({"width": 390, "height": 844})
    page.wait_for_timeout(250)
    assert_no_overflow(page, "已暂停 390", failures)
    page.screenshot(path=str(ARTIFACTS / "08-paused-390.png"))
    page.set_viewport_size({"width": 1440, "height": 1000})


def main():
    process, handle, url = start_preview()
    failures, console_errors, page_errors = [], [], []
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            context = browser.new_context(viewport={"width": 1440, "height": 1000})
            page = context.new_page()
            page.on("pageerror", lambda error: page_errors.append(str(error)))
            page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
            frames = []
            page.on("websocket", lambda socket: socket.on("framesent", lambda payload: frames.append(payload)))
            page.goto(url)
            page.wait_for_selector("#workspace:not([hidden])")
            page.wait_for_selector(".session-row")
            page.wait_for_timeout(400)
            check_plain_chat(page, failures)
            check_ready(page, failures)
            check_running(page, failures, frames)
            check_paused(page, failures)
            browser.close()
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
        handle.close()

    if console_errors:
        failures.append(f"控制台错误：{console_errors[:5]}")
    if page_errors:
        failures.append(f"页面异常：{page_errors[:5]}")
    if failures:
        print("验收失败：")
        for item in failures:
            print(f"  - {item}")
        print(f"截图：{ARTIFACTS}")
        sys.exit(1)
    print("浏览器验收通过（普通会话 / 待确认 / 执行中 / 已暂停，1440 与 390）。")
    print(f"截图：{ARTIFACTS}")


if __name__ == "__main__":
    main()
