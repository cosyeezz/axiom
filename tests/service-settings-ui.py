"""服务设置真实浏览器布局检查：python tests/service-settings-ui.py；仅运行隔离预览。"""
import os
import socket
import subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
with socket.socket() as sock:
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
process = subprocess.Popen(["node", "tests/conversation-preview.mjs"], cwd=ROOT,
    env={**os.environ, "PREVIEW_PORT": str(port)}, stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT, text=True)
try:
    line = process.stdout.readline()
    assert "UI preview:" in line, line
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        for width in (1440, 390, 320):
            page = browser.new_page(viewport={"width": width, "height": 900})
            page.set_default_timeout(10000)
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto(f"http://127.0.0.1:{port}")
            page.wait_for_function("document.querySelector('#open-settings').onclick !== null")
            if width < 700:
                page.locator("#toggle-sidebar").click()
            page.locator("#open-settings").click()
            page.get_by_role("button", name="服务与更新", exact=True).click()
            assert page.locator("#restart-quick").is_visible()
            assert page.locator("#restart-quick").is_disabled()  # 预览无守护进程
            assert not page.locator("#defaults-panel").is_visible()
            assert page.evaluate("document.querySelector('#settings').scrollWidth <= document.querySelector('#settings').clientWidth")
            assert not page.locator("#service-menu-button").count()
            assert "代码目录" not in page.locator("#settings").inner_text()
            assert not errors, errors
            page.keyboard.press("Escape")
            assert not page.locator("#settings").is_visible()
            page.close()
            print(f"service settings {width}px: PASS")
        browser.close()
finally:
    process.terminate()
    process.wait(timeout=10)
