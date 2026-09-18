"""真实 Chromium 验收：模型菜单分区稳定性（假数据预览，无真实模型/用户数据）。

由脚本自己拉起 tests/frontend-regions-preview.mjs（temp 目录、假模型目录、假收藏），
再用真实 WS 协议从外部触发目录/收藏变化，覆盖：

  1. 无变化不重建：草稿输入、无关状态同步（收藏广播同值）、输出增长时，菜单节点身份、
     焦点、scrollTop、aria-expanded、选中值都不动。
  2. 键盘与读屏：↑↓/Home/End 移动、字符查找、Esc 不改值、Tab 到星再退出、Enter 选中。
  3. 收藏真变化：菜单内点星就地翻转；另一窗口改收藏经广播同步，选中值不变。
  4. 目录真变化：隐藏一个中间模型后重建，但按稳定键恢复焦点、保持滚动位置、不触发 change。
  5. 删除选中模型不静默切换：保留原选中值并标注「当前不可用」，不触发 change。
  6. dispose 清监听：幂等 enhance、重复开关不累积节点、单 select/整实例 dispose 后不再响应。

用法：python tests/frontend-regions-ui.py
仅回归检查时可复用已启动的预览：AXIOM_PREVIEW_URL=http://127.0.0.1:4347
"""
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
ARTIFACTS = Path(os.environ.get("AXIOM_REGIONS_ARTIFACTS", Path(tempfile.gettempdir()) / "axiom-frontend-regions"))
ARTIFACTS.mkdir(parents=True, exist_ok=True)
sys.stdout.reconfigure(encoding="utf-8")

SNAPSHOT = """() => {
  const visible = [...document.querySelectorAll('.ax-mp-menu')].filter((node) => node.getClientRects().length > 0);
  const menu = visible[0] || null;
  const model = document.getElementById('model');
  if (!menu) return { open: false, selected: model.value, expanded: model.getAttribute('aria-expanded') };
  const opts = [...menu.querySelectorAll('.ax-mp-opt')];
  opts.forEach((node, index) => { if (!node.dataset.probe) node.dataset.probe = 'p' + index; });
  const active = document.activeElement;
  return {
    open: true,
    values: opts.map((node) => node.dataset.value),
    texts: opts.map((node) => node.textContent),
    probes: opts.map((node) => node.dataset.probe),
    focused: active && menu.contains(active) ? (active.dataset.value ?? null) : null,
    focusedProbe: active && menu.contains(active) && active.classList.contains('ax-mp-opt') ? active.dataset.probe : null,
    focusedStar: Boolean(active && menu.contains(active) && active.classList.contains('ax-mp-star')),
    scrollTop: menu.scrollTop,
    expanded: model.getAttribute('aria-expanded'),
    selected: model.value,
  };
}"""

MENU_OPEN = "() => document.getElementById('model').getAttribute('aria-expanded') === 'true'"
MENU_CLOSED = "() => ![...document.querySelectorAll('.ax-mp-menu')].some((node) => node.getClientRects().length)"


def snapshot(page):
    return page.evaluate(SNAPSHOT)


def expand_composer(page):
    # 桌面输入区默认折叠，#model 等控件此时不可见。真实路径是先触碰输入区再操作，
    # 这里按同样的路径点开；焦点留在输入区内，5s 自动收回不会中途触发。
    page.locator("#prompt").click()
    page.wait_for_function("() => document.querySelector('.composer-wrap').dataset.collapsed === 'false'")


def open_menu(page):
    if page.evaluate(MENU_OPEN):
        return
    page.locator("#model").click()
    page.wait_for_function(MENU_OPEN)


def close_menu(page):
    if not page.evaluate(MENU_OPEN):
        return
    page.keyboard.press("Escape")
    page.wait_for_function(MENU_CLOSED)


def ws_call(page, payload, timeout=6000):
    """从页面同源再开一条真实业务 WS，走 protocol.parse 与 server broadcast。"""
    payload = {**payload, "id": payload.get("id", "ctl")}
    return page.evaluate(
        """([payload, timeout]) => new Promise((resolve, reject) => {
            const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`, ['axiom']);
            const timer = setTimeout(() => { try { ws.close(); } catch {} reject(new Error('控制 WS 超时')); }, timeout);
            ws.onopen = () => ws.send(JSON.stringify(payload));
            ws.onmessage = (event) => {
                const message = JSON.parse(event.data);
                if (message.type !== 'response' || message.id !== payload.id) return;
                clearTimeout(timer);
                ws.close();
                message.ok ? resolve(message.data) : reject(new Error(message.error));
            };
            ws.onerror = () => { clearTimeout(timer); reject(new Error('控制 WS 连接失败')); };
        })""",
        [payload, timeout],
    )


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def start_preview():
    node = shutil.which("node")
    assert node, "找不到 node"
    port = free_port()
    log = ARTIFACTS / "frontend-regions-preview.log"
    handle = log.open("w", encoding="utf-8")
    process = subprocess.Popen(
        [node, "tests/frontend-regions-preview.mjs"], cwd=REPO,
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


def report(name, ok, detail="", failures=None):
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f" -> {detail}"))
    if not ok and failures is not None:
        failures.append(name)


def check_no_rebuild(page, failures):
    """数据没变时：节点身份/焦点/滚动/选中值都不该被动过。"""
    page.evaluate("() => { document.getElementById('prompt').value = ''; }")
    open_menu(page)
    page.evaluate(
        """() => {
          const menu = [...document.querySelectorAll('.ax-mp-menu')].find((node) => node.getClientRects().length);
          menu.scrollTop = Math.round((menu.scrollHeight - menu.clientHeight) / 2);
          menu.querySelector('.ax-mp-opt[data-value="openai/gpt-5.9"]').focus();
        }"""
    )
    before = snapshot(page)
    report("菜单已在滚动中间打开且聚焦中间项", before["open"] and before["focused"] == "openai/gpt-5.9" and before["scrollTop"] > 0, str(before), failures)

    # 草稿输入：真实 input 事件走进 app 的输入区更新
    page.evaluate(
        """() => {
          const prompt = document.getElementById('prompt');
          prompt.value = '分区验收草稿：模型菜单不该被重建';
          prompt.dispatchEvent(new Event('input', { bubbles: true }));
        }"""
    )
    draft = snapshot(page)
    report("草稿输入后菜单节点身份不变", draft["probes"] == before["probes"], f"{before['probes']} -> {draft['probes']}", failures)
    report("草稿输入后焦点/滚动/展开态不变",
           draft["focusedProbe"] == before["focusedProbe"] and draft["scrollTop"] == before["scrollTop"]
           and draft["expanded"] == "true" and draft["selected"] == before["selected"],
           f"focus {draft['focusedProbe']} / {before['focusedProbe']}，scroll {draft['scrollTop']} / {before['scrollTop']}", failures)
    report("草稿文本保留", page.locator("#prompt").input_value() == "分区验收草稿：模型菜单不该被重建", page.locator("#prompt").input_value(), failures)

    # 无关状态同步：收藏广播同值，走到 modelPicker.syncAll 但签名未变
    ws_call(page, {"id": "fav-noop", "type": "models.favorites.set", "kind": "model", "key": "openai/gpt-5.4", "favorite": True})
    page.wait_for_timeout(400)
    synced = snapshot(page)
    report("收藏广播同值不重建菜单", synced["open"] and synced["probes"] == before["probes"] and synced["focusedProbe"] == before["focusedProbe"],
           str(synced), failures)
    report("收藏广播同值不动滚动/选中值",
           synced["scrollTop"] == before["scrollTop"] and synced["selected"] == before["selected"] and synced["expanded"] == "true",
           f"scroll {synced['scrollTop']} / {before['scrollTop']}，selected {synced['selected']}", failures)

    # 正文增长并触发实际滚动；菜单必须一直打开，不能关闭再重开冒充稳定。
    page.evaluate(
        """() => {
          const filler = document.createElement('pre');
          filler.textContent = ('隔离正文输出' + String.fromCharCode(10)).repeat(100);
          document.getElementById('output').append(filler);
          document.getElementById('transcript').scrollTop += 100;
        }"""
    )
    page.wait_for_timeout(250)
    grown = snapshot(page)
    report("输出增长不改选中值", grown["selected"] == before["selected"], str(grown), failures)
    report("输出增长不改草稿", page.locator("#prompt").input_value() == "分区验收草稿：模型菜单不该被重建", "", failures)
    report("输出期间菜单始终打开且节点焦点滚动不变",
           grown["open"] and grown["probes"] == before["probes"]
           and grown["focusedProbe"] == before["focusedProbe"] and grown["scrollTop"] == before["scrollTop"], str(grown), failures)
    page.screenshot(path=str(ARTIFACTS / "01-no-rebuild.png"))


def check_keyboard(page, failures):
    """键盘与读屏语义不能退化；此处只验证不改值的部分，Enter 选中放到最后。"""
    close_menu(page)
    page.locator("#model").focus()
    page.keyboard.press("ArrowDown")
    page.wait_for_function(MENU_OPEN)
    opened = snapshot(page)
    report("↑/↓ 打开菜单并停在当前选中项", opened["open"] and opened["focused"] == opened["selected"], str(opened), failures)

    page.keyboard.press("End")
    at_end = snapshot(page)
    report("End 到末项", at_end["focused"] == at_end["values"][-1], at_end["focused"], failures)
    page.keyboard.press("Home")
    at_home = snapshot(page)
    report("Home 到首项", at_home["focused"] == at_home["values"][0], at_home["focused"], failures)
    page.keyboard.press("ArrowDown")
    stepped = snapshot(page)
    report("↓ 移动一项", stepped["focused"] == stepped["values"][1], stepped["focused"], failures)

    page.keyboard.type("gpt-5.17", delay=20)
    typed = snapshot(page)
    report("字符查找定位到 GPT-5.17", typed["focused"] == "openai/gpt-5.17", typed["focused"], failures)

    value = page.locator("#model").input_value()
    page.keyboard.press("Escape")
    page.wait_for_function(MENU_CLOSED)
    page.wait_for_timeout(120)
    report("Escape 关闭且不改选中值", page.locator("#model").input_value() == value and page.locator("#model").get_attribute("aria-expanded") == "false",
           page.locator("#model").input_value(), failures)

    # Tab：先移焦到星，再退出菜单并把焦点还给 select
    page.locator("#model").click()
    page.wait_for_function(MENU_OPEN)
    page.keyboard.press("Tab")
    tabbed = snapshot(page)
    report("Tab 移到收藏星", tabbed["focusedStar"] is True, str(tabbed), failures)
    page.keyboard.press("Tab")
    page.wait_for_function(MENU_CLOSED)
    page.wait_for_timeout(120)
    report("Tab 退出并聚焦回触发器", page.evaluate("() => document.activeElement.id") == "model", page.evaluate("() => document.activeElement.id"), failures)
    page.screenshot(path=str(ARTIFACTS / "02-keyboard.png"))


def check_favorites(page, failures, context, url):
    """收藏真实变化：菜单内点星就地响应；另一窗口改收藏经广播同步。"""
    open_menu(page)
    first = snapshot(page)
    report("预置收藏置顶且标为已收藏", first["values"][0] == "openai/gpt-5.4", str(first["values"][:3]), failures)
    star_checked = page.locator('.ax-mp-menu:visible .ax-mp-star[data-value="openai/gpt-5.4"]').get_attribute("aria-checked")
    report("置顶项星标 aria-checked=true", star_checked == "true", star_checked, failures)

    value = page.locator("#model").input_value()
    page.locator('.ax-mp-menu:visible .ax-mp-star[data-value="openai/gpt-5.6"]').click()
    page.wait_for_function("() => document.querySelector('.ax-mp-menu:not([hidden]) .ax-mp-star[data-value=\"openai/gpt-5.6\"]').getAttribute('aria-checked') === 'true'")
    toggled = snapshot(page)
    report("点星只改收藏、不关菜单、不改选中值", toggled["open"] and toggled["selected"] == value, str(toggled), failures)
    report("点星后焦点留在该星上", toggled["focusedStar"] and toggled["focused"] == "openai/gpt-5.6", str(toggled), failures)

    page.locator('.ax-mp-menu:visible .ax-mp-star[data-value="openai/gpt-5.6"]').click()
    page.wait_for_function("() => document.querySelector('.ax-mp-menu:not([hidden]) .ax-mp-star[data-value=\"openai/gpt-5.6\"]').getAttribute('aria-checked') === 'false'")
    page.wait_for_timeout(250)

    # 第二窗口变更收藏 → 广播到第一窗口的已开菜单
    other = context.new_page()
    other.goto(url)
    other.wait_for_selector("#workspace:not([hidden])")
    expand_composer(other)
    other.wait_for_selector("#model:enabled")
    other.locator("#model").click()
    other.wait_for_selector('.ax-mp-menu:visible .ax-mp-star[data-value="openai/gpt-5.7"]')
    other.locator('.ax-mp-menu:visible .ax-mp-star[data-value="openai/gpt-5.7"]').click()
    other.wait_for_function("() => document.querySelector('.ax-mp-menu:not([hidden]) .ax-mp-star[data-value=\"openai/gpt-5.7\"]').getAttribute('aria-checked') === 'true'")
    page.wait_for_function(
        "() => { const node = document.querySelector('.ax-mp-menu:not([hidden]) .ax-mp-star[data-value=\"openai/gpt-5.7\"]'); return node && node.getAttribute('aria-checked') === 'true'; }"
    )
    broadcast = snapshot(page)
    report("跨窗口收藏广播后本窗口菜单已同步", broadcast["open"] and broadcast["selected"] == value, str(broadcast), failures)
    other.close()
    page.wait_for_timeout(200)
    page.screenshot(path=str(ARTIFACTS / "03-favorites.png"))


def check_catalog_change(page, failures):
    """目录真变化：隐藏一个不相关模型后重建，但焦点与滚动按稳定键恢复，选中值不动。"""
    open_menu(page)
    page.evaluate(
        """() => {
          window.__modelChanges = 0;
          document.getElementById('model').addEventListener('change', () => { window.__modelChanges += 1; });
          const menu = [...document.querySelectorAll('.ax-mp-menu')].find((node) => node.getClientRects().length);
          menu.scrollTop = Math.round((menu.scrollHeight - menu.clientHeight) / 2);
          menu.querySelector('.ax-mp-opt[data-value="openai/gpt-5.9"]').focus();
        }"""
    )
    before = snapshot(page)
    report("目录变化前菜单处于滚动中间并聚焦中间项", before["scrollTop"] > 0 and before["focused"] == "openai/gpt-5.9", str(before), failures)

    ws_call(page, {"id": "hide-below", "type": "models.hidden.set", "key": "openai/gpt-5.20", "hidden": True})
    page.wait_for_function("() => document.getElementById('model').options.length === 23")
    page.wait_for_function("() => [...document.querySelectorAll('.ax-mp-menu .ax-mp-opt')].length === 23")
    page.wait_for_timeout(120)
    after = snapshot(page)

    report("目录真变化后选项确实减少", "openai/gpt-5.20" not in after["values"] and len(after["values"]) == 23, f"{len(after['values'])} 项", failures)
    report("目录真变化后焦点按稳定键恢复", after["focused"] == "openai/gpt-5.9", after["focused"], failures)
    report("目录真变化后仍保持滚动位置", abs(after["scrollTop"] - before["scrollTop"]) <= 1, f"{after['scrollTop']} / {before['scrollTop']}", failures)
    report("目录真变化不关菜单、不改选中值", after["open"] and after["expanded"] == "true" and after["selected"] == before["selected"], str(after), failures)
    report("目录真变化不触发 change", page.evaluate("() => window.__modelChanges") == 0, page.evaluate("() => window.__modelChanges"), failures)
    page.screenshot(path=str(ARTIFACTS / "04-catalog-change.png"))


def check_delete_selected(page, failures):
    """删除当前选中模型：保留原值并标注不可用，绝不静默换模型。"""
    close_menu(page)
    selected = page.locator("#model").input_value()
    page.evaluate("() => { window.__modelChanges = 0; }")
    ws_call(page, {"id": "hide-selected", "type": "models.hidden.set", "key": selected, "hidden": True})
    page.wait_for_function(
        "(value) => { const option = [...document.getElementById('model').options].find((item) => item.value === value); return option && option.textContent.includes('当前不可用'); }",
        arg=selected,
    )
    page.wait_for_timeout(150)
    report("删除选中模型后选中值不变", page.locator("#model").input_value() == selected, page.locator("#model").input_value(), failures)
    report("删除选中模型不触发 change", page.evaluate("() => window.__modelChanges") == 0, page.evaluate("() => window.__modelChanges"), failures)
    report("删除选中模型后 select 仍可用", page.locator("#model").is_enabled(), "", failures)
    open_menu(page)
    unavailable = page.locator(f'.ax-mp-menu:visible .ax-mp-opt[data-value="{selected}"]').inner_text()
    report("菜单里该模型标注「当前不可用」", "当前不可用" in unavailable, unavailable, failures)
    page.keyboard.press("Escape")
    page.wait_for_function(MENU_CLOSED)
    page.screenshot(path=str(ARTIFACTS / "05-delete-selected.png"))


def check_enter_selects(page, failures):
    """键盘 Enter 选中仍可用的模型：值变了、change 发了、菜单关了。"""
    page.evaluate("() => { window.__modelChanges = 0; }")
    page.locator("#model").focus()
    page.keyboard.press("ArrowDown")
    page.wait_for_function(MENU_OPEN)
    page.evaluate(
        """() => {
          const menu = [...document.querySelectorAll('.ax-mp-menu')].find((node) => node.getClientRects().length);
          menu.querySelector('.ax-mp-opt[data-value="openai/gpt-5.1"]').focus();
        }"""
    )
    page.keyboard.press("Enter")
    page.wait_for_function("() => document.getElementById('model').value === 'openai/gpt-5.1'")
    page.wait_for_function(MENU_CLOSED)
    page.wait_for_timeout(150)
    report("Enter 选中新模型并关闭菜单", page.locator("#model").get_attribute("aria-expanded") == "false", "", failures)
    report("Enter 选中触发一次 change", page.evaluate("() => window.__modelChanges") == 1, page.evaluate("() => window.__modelChanges"), failures)
    report("草稿在全部交互后仍在", page.locator("#prompt").input_value() == "分区验收草稿：模型菜单不该被重建", page.locator("#prompt").input_value(), failures)


def check_dispose(page, failures):
    """dispose 清监听：幂等 enhance、重复开关不累积节点、释放后不再响应。"""
    result = page.evaluate(
        """async () => {
            const { createModelPicker } = await import('/model-picker.js');
            const menus = () => document.querySelectorAll('.ax-mp-menu').length;
            const visible = () => [...document.querySelectorAll('.ax-mp-menu')].filter((node) => node.getClientRects().length).length;
            const baseline = menus();
            const select = document.createElement('select');
            select.setAttribute('aria-label', 'dispose 探针');
            for (const value of ['alpha', 'beta', 'gamma']) select.append(new Option(value, value));
            document.body.append(select);
            const picker = createModelPicker({ getFavorites: () => ({ model: [] }) });
            picker.enhance(select, 'model');
            picker.enhance(select, 'model'); // 幂等：不得挂第二套监听
            const afterEnhance = menus();
            for (let i = 0; i < 5; i++) { select.click(); select.click(); }
            const afterToggles = menus();
            select.click();
            const whileOpen = { expanded: select.getAttribute('aria-expanded'), visible: visible() };
            picker.dispose(select);
            const afterRelease = {
                expanded: select.getAttribute('aria-expanded'),
                haspopup: select.getAttribute('aria-haspopup'),
                menus: menus(),
            };
            select.click(); // 释放后点击不得再打开
            const reopened = visible();
            picker.dispose();
            picker.dispose(); // 重复 dispose 安全
            const other = document.createElement('select');
            other.append(new Option('x', 'x'));
            document.body.append(other);
            picker.enhance(other, 'model');
            const otherHaspopup = other.getAttribute('aria-haspopup');
            select.remove();
            other.remove();
            return { baseline, afterEnhance, afterToggles, whileOpen, afterRelease, reopened, otherHaspopup };
        }"""
    )
    report("enhance 幂等：二次调用不新增菜单", result["afterEnhance"] == result["baseline"], str(result), failures)
    report("重复开关 5 次只留一个菜单节点", result["afterToggles"] == result["baseline"] + 1, str(result), failures)
    report("dispose 前菜单确实打开", result["whileOpen"]["expanded"] == "true" and result["whileOpen"]["visible"] == 1, str(result), failures)
    report("dispose 后还原原生 select 并移除菜单",
           result["afterRelease"]["expanded"] is None and result["afterRelease"]["haspopup"] is None
           and result["afterRelease"]["menus"] == result["baseline"], str(result), failures)
    report("dispose 后点击不再打开菜单", result["reopened"] == 0, str(result), failures)
    report("整实例 dispose 后不再接新 select", result["otherHaspopup"] is None, str(result), failures)


def main():
    started = None
    url = os.environ.get("AXIOM_PREVIEW_URL")
    if not url:
        started = start_preview()
        url = started[2]
    failures, page_errors, console_errors = [], [], []
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            context = browser.new_context(viewport={"width": 1440, "height": 1000})
            page = context.new_page()
            page.on("pageerror", lambda error: page_errors.append(str(error)))
            page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
            page.goto(url)
            page.wait_for_selector("#workspace:not([hidden])")
            expand_composer(page)
            page.wait_for_selector("#model:enabled")
            page.wait_for_function("() => document.getElementById('model').options.length >= 24")
            page.wait_for_timeout(300)

            check_no_rebuild(page, failures)
            check_keyboard(page, failures)
            check_favorites(page, failures, context, url)
            check_catalog_change(page, failures)
            check_delete_selected(page, failures)
            check_enter_selects(page, failures)
            check_dispose(page, failures)
            browser.close()
    finally:
        if started:
            started[0].terminate()
            try:
                started[0].wait(timeout=5)
            except subprocess.TimeoutExpired:
                started[0].kill()
            started[1].close()

    if page_errors:
        failures.append(f"页面异常：{page_errors[:5]}")
    if console_errors:
        failures.append(f"控制台错误：{console_errors[:5]}")

    if failures:
        print("验收失败：")
        for item in failures:
            print(f"  - {item}")
        print(f"截图：{ARTIFACTS}")
        sys.exit(1)
    print("模型菜单分区验收通过：无变化不重建 / 键盘 / 收藏真变化 / 目录真变化稳定键恢复 / 删除不静默切换 / dispose 清监听。")
    print(f"截图：{ARTIFACTS}")


if __name__ == "__main__":
    main()
