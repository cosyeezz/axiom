"""真实 Chromium 验收：由脚本自己拉起 tests/goal-preview.mjs（干净状态，可重复运行）。

覆盖面：普通会话与新会话不出现目标面板；待确认 / 执行中 / 已暂停三种阶段；轮次折叠不丢消息；
暂停只发 goal.action；输入区「+ / 图片 / 目标」同处一条组边框且目标图标无独立描边；
控制面板桌面单行（状态+提示左、操作右），390 按需换行不溢出；
已暂停点退出只发一条 goal.action(exit)，清掉目标面板与轮次标记但对话 DOM 原样保留；
桌面与 390px 无横向溢出、无控制台错误。截图写到临时目录（不入库）。

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


def expand_composer(page):
    """桌面输入区默认折叠成一行（图标组、模型栏此时 display:none）；按真实交互点一下输入框展开再验收。"""
    if page.locator('#composer[data-collapsed="true"]').count() == 0:
        return
    page.locator("#prompt").click()
    page.wait_for_selector('#composer[data-collapsed="false"]', timeout=5000)
    page.wait_for_timeout(120)


def check_plain_chat(page, failures):
    open_session(page, "chat-plain", "普通会话 · 无目标")
    expand_composer(page)
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


def group_metrics(page):
    return page.evaluate(
        """() => {
          const group = document.querySelector('.composer-wrap .context-bar .icon-group');
          if (!group) return { found: false };
          const widths = (node) => {
            const s = getComputedStyle(node);
            return [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth]
              .map((value) => parseFloat(value) || 0);
          };
          const box = (node) => {
            const r = node.getBoundingClientRect();
            return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width };
          };
          const visible = (node) => !node.hidden && box(node).width > 0;
          return { found: true, ids: [...group.children].map((node) => node.id),
                   group: { borders: widths(group), box: box(group) },
                   children: [...group.children].map((node) => ({ id: node.id, visible: visible(node),
                     borders: widths(node), box: box(node) })),
                   // 同一行内除图标组外不应再出现第二个描边容器。
                   framed: [...document.querySelectorAll('.composer-wrap .context-bar > *')]
                     .filter((node) => visible(node) && widths(node).some((value) => value > 0))
                     .map((node) => `${node.tagName}.${node.className}`) };
        }"""
    )


def assert_composer_group(metrics, where, failures):
    if not metrics.get("found"):
        failures.append(f"{where}：输入区没有图标组容器 .icon-group")
        return
    if metrics["ids"] != ["add-context", "add-image", "goal-enter"]:
        failures.append(f"{where}：图标组应包含 + / 图片 / 目标三项，实际 {metrics['ids']}")
    if not all(item["visible"] for item in metrics["children"]):
        failures.append(f"{where}：图标组内有不可见图标：{metrics['children']}")
    if not all(value > 0 for value in metrics["group"]["borders"]):
        failures.append(f"{where}：图标组没有共用边框：{metrics['group']['borders']}")
    for item in metrics["children"]:
        if any(value > 0 for value in item["borders"]):
            failures.append(f"{where}：图标组成员自带独立边框（{item['id']}）：{item['borders']}")
        child, group = item["box"], metrics["group"]["box"]
        if (child["left"] < group["left"] - 1 or child["right"] > group["right"] + 1
                or child["top"] < group["top"] - 1 or child["bottom"] > group["bottom"] + 1):
            failures.append(f"{where}：图标 {item['id']} 越出组边框：{child} / {group}")
    if metrics["framed"] != ["DIV.icon-group"]:
        failures.append(f"{where}：输入区首行描边容器应只有图标组，实际 {metrics['framed']}")


def check_new_session(page, failures):
    """全新空会话同样不能出现目标面板（无历史消息也不该凭空长出一个）。"""
    open_session(page, "chat-new", "新会话")
    expand_composer(page)
    assert page.locator("#goal-track").is_hidden(), "新会话不该有目标进度条"
    assert page.locator("#goal-dock").is_hidden(), "新会话不该有目标控制面板"
    assert page.locator("#goal-enter").is_visible(), "新会话应保留目标入口图标"
    if page.locator(".goal-round-head, #output [data-goal-round]").count():
        failures.append("新会话出现了目标轮次标记")
    assert_no_overflow(page, "新会话 1440", failures)


def check_composer_group(page, failures):
    """输入区图标组：+ / 图片 / 目标共用一条组边框，目标图标不再自带独立描边。"""
    open_session(page, "chat-plain", "普通会话 · 无目标")
    expand_composer(page)
    assert_composer_group(group_metrics(page), "图标组 1440", failures)
    # 包进组后图片上传仍要能拉起文件选择。
    with page.expect_file_chooser(timeout=5000) as chooser:
        page.locator("#add-image").click()
    if not chooser.value.is_multiple():
        failures.append("图片上传未保持多选")
    assert_no_overflow(page, "图标组 1440", failures)
    page.screenshot(path=str(ARTIFACTS / "12-composer-group-desktop.png"))
    page.set_viewport_size({"width": 390, "height": 844})
    page.wait_for_timeout(250)
    # 手机宽度下输入区默认收起，先展开再验收同一套指标（否则元素 display:none，检查会空转）。
    if page.locator(".shell.mobile-expanded").count() == 0:
        page.locator("#mobile-expand").click()
    page.wait_for_selector(".composer-wrap .context-bar .icon-group", state="visible")
    page.wait_for_timeout(120)
    assert_composer_group(group_metrics(page), "图标组 390", failures)
    assert_no_overflow(page, "图标组 390", failures)
    page.screenshot(path=str(ARTIFACTS / "13-composer-group-390.png"))
    page.set_viewport_size({"width": 1440, "height": 1000})
    page.wait_for_timeout(200)


def dock_metrics(page):
    return page.evaluate(
        """() => {
          const dock = document.getElementById('goal-dock');
          if (!dock || dock.hidden) return { hidden: true };
          const box = (node) => {
            const r = node.getBoundingClientRect();
            return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
          };
          const actions = dock.querySelector('.goal-dock-actions');
          const left = [...dock.children].find((node) => node !== actions);
          return { hidden: false, box: box(dock), actions: actions ? box(actions) : null,
                   left: left ? box(left) : null,
                   buttons: [...dock.querySelectorAll('button')].map((node) => ({
                     label: node.textContent.trim(), visible: !node.hidden && box(node).width > 0, box: box(node) })) };
        }"""
    )


def assert_dock_row(metrics, where, failures):
    """桌面一行：状态与提示靠左、操作靠右且同一行，不再叠成第三层高栏。"""
    if metrics.get("hidden") or not metrics["actions"] or not metrics["left"]:
        failures.append(f"{where}：目标控制面板不可用或结构缺失 {metrics}")
        return
    dock, left, actions = metrics["box"], metrics["left"], metrics["actions"]
    if actions["left"] < dock["left"] + dock["width"] * 0.5:
        failures.append(f"{where}：操作区未靠右：{actions} / {dock}")
    if left["right"] > actions["left"] + 1:
        failures.append(f"{where}：左侧信息与操作区重叠：{left} / {actions}")
    if actions["top"] >= left["bottom"]:
        failures.append(f"{where}：操作区被挤到第三层（与信息不在同一行）：{left} / {actions}")
    for name, node in (("信息块", left), ("操作区", actions)):
        if node["right"] > dock["right"] + 1 or node["left"] < dock["left"] - 1:
            failures.append(f"{where}：{name}越出面板：{node} / {dock}")
    # 单行高度：信息与操作同层时面板高度 ≈ max(两块) + 内边距；旧的三层堆叠会明显高出很多。
    if dock["height"] > max(left["height"], actions["height"]) + 30:
        failures.append(f"{where}：面板仍然是多层高栏：{dock} / 左 {left} / 右 {actions}")


def check_dock_layout(page, failures):
    """打包后的控制面板布局：桌面单行（状态+提示左 / 操作右），手机换行不溢出。"""
    # 已暂停按钮最多（继续/调整 Goal/重启/退出），是单行布局与换行布局的最坏情况。
    open_session(page, "goal-paused", "状态验收 · 已暂停")
    assert_dock_row(dock_metrics(page), "已暂停 1440 控制面板", failures)
    page.screenshot(path=str(ARTIFACTS / "14-dock-compact-paused-desktop.png"))
    page.set_viewport_size({"width": 390, "height": 844})
    page.wait_for_timeout(250)
    metrics = dock_metrics(page)
    if metrics.get("hidden") or not metrics["actions"]:
        failures.append(f"390 控制面板不可用：{metrics}")
    else:
        dock, actions = metrics["box"], metrics["actions"]
        if actions["left"] < dock["left"] - 1 or actions["right"] > dock["right"] + 1:
            failures.append(f"390 操作区越出面板：{actions} / {dock}")
        if actions["bottom"] > dock["bottom"] + 1:
            failures.append(f"390 操作区溢出面板：{actions} / {dock}")
        for item in metrics["buttons"]:
            if not item["visible"]:
                failures.append(f"390 按钮不可见：{item['label']}")
            elif item["box"]["right"] > dock["right"] + 1:
                failures.append(f"390 按钮越出面板：{item['label']} {item['box']} / {dock}")
    assert_no_overflow(page, "控制面板 390", failures)
    page.screenshot(path=str(ARTIFACTS / "15-dock-compact-paused-390.png"))
    page.set_viewport_size({"width": 1440, "height": 1000})
    page.wait_for_timeout(200)


def check_paused_exit(page, failures, frames):
    """已暂停点退出：只发一条 goal.action(exit)，清面板与轮次标记，对话 DOM 逐字保留。"""
    open_session(page, "goal-paused", "状态验收 · 已暂停")
    dock = page.locator("#goal-dock")
    if not dock.is_visible():
        failures.append("已暂停会话没有目标控制面板")
        return
    exit_button = dock.locator("button", has_text="退出")
    if exit_button.count() != 1:
        failures.append(f"已暂停面板应有一个退出按钮，实际 {exit_button.count()}：{dock.inner_text()[:160]!r}")
        return
    if not exit_button.first.is_enabled():
        failures.append("已暂停时退出按钮不可用")
        return
    page.screenshot(path=str(ARTIFACTS / "09-paused-exit-before-desktop.png"))
    # 先给对话消息打标记：退出只清目标面板，不能重建或删除任何消息节点。
    before = page.evaluate(
        """() => {
          const nodes = [...document.querySelectorAll('#output .message')];
          nodes.forEach((node, index) => { node.dataset.exitMark = `m${index}`; });
          return { count: nodes.length, text: nodes.map((node) => node.textContent),
                   rounds: document.querySelectorAll('#output .goal-round-head').length };
        }"""
    )
    if before["count"] == 0:
        failures.append("已暂停会话没有可用于校验保留情况的对话消息")
    mark = len(frames)
    exit_button.first.click()
    page.wait_for_function(
        "() => document.getElementById('goal-dock').hidden && document.getElementById('goal-track').hidden"
    )
    expand_composer(page)
    page.wait_for_selector("#goal-enter", state="visible")
    page.wait_for_timeout(200)
    sent = [json.loads(item) for item in frames[mark:] if item.strip().startswith("{")]
    kinds = [item.get("type") for item in sent]
    if kinds != ["goal.action"]:
        failures.append(f"退出后发出的请求不止 goal.action：{sent}")
    elif sent[0].get("action") != "exit":
        failures.append(f"退出请求动作错误：{sent[0]}")
    if any(item.get("type") in {"prompt", "session.retry", "cancel"} for item in sent):
        failures.append(f"退出夹带了其他请求：{sent}")
    after = page.evaluate(
        """() => {
          const nodes = [...document.querySelectorAll('#output .message')];
          return { count: nodes.length, text: nodes.map((node) => node.textContent),
                   marked: nodes.filter((node) => node.dataset.exitMark).length,
                   rounds: document.querySelectorAll('#output .goal-round-head').length,
                   columns: document.querySelectorAll('#output [data-goal-round]').length };
        }"""
    )
    if after["count"] != before["count"] or after["text"] != before["text"]:
        failures.append(f"退出改动了对话内容：{before['count']} -> {after['count']} 条")
    if after["marked"] != before["count"]:
        failures.append(f"退出重建了对话节点：原标记命中 {after['marked']} / {before['count']}")
    if after["rounds"] or after["columns"]:
        failures.append(f"退出后仍残留目标轮次标记：{after}")
    if page.locator("#goal-dock").is_visible() or page.locator("#goal-track").is_visible():
        failures.append("退出后目标面板仍然可见")
    assert_no_overflow(page, "退出后 1440", failures)
    page.screenshot(path=str(ARTIFACTS / "10-paused-exit-after-desktop.png"))
    page.set_viewport_size({"width": 390, "height": 844})
    page.wait_for_timeout(250)
    if page.locator("#goal-dock").is_visible() or page.locator("#goal-track").is_visible():
        failures.append("390px 退出后目标面板仍然可见")
    assert_no_overflow(page, "退出后 390", failures)
    page.screenshot(path=str(ARTIFACTS / "11-paused-exit-after-390.png"))
    page.set_viewport_size({"width": 1440, "height": 1000})
    page.wait_for_timeout(200)


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
            check_new_session(page, failures)
            check_ready(page, failures)
            check_running(page, failures, frames)
            check_paused(page, failures)
            check_dock_layout(page, failures)
            # 退出会永久清掉预览里的 paused 目标，必须放在其他 paused 用例之后。
            check_paused_exit(page, failures, frames)
            check_composer_group(page, failures)
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
    print("浏览器验收通过（普通会话 / 新会话 / 待确认 / 执行中 / 已暂停 / 退出目标模式 / 图标组 / 控制面板布局，1440 与 390）。")
    print(f"截图：{ARTIFACTS}")


if __name__ == "__main__":
    main()
