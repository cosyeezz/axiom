"""远程设置布局回归：python tests/remote-ui.py（需 Playwright + Chromium）。
仅启动静态样例，不访问用户数据、不调用真实 Tailscale、不启用远程访问。
"""
import os
import socket
import subprocess
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
with socket.socket() as sock:
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
process = subprocess.Popen(
    ["node", "tests/conversation-preview.mjs"], cwd=ROOT,
    env={**os.environ, "PREVIEW_PORT": str(port)},
    stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
)
try:
    line = process.stdout.readline()
    assert "UI preview:" in line, line
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        for width in (1440, 390, 320):
            page = browser.new_page(viewport={"width": width, "height": 900})
            page.set_default_timeout(8000)
            page.goto(f"http://127.0.0.1:{port}")
            page.wait_for_function("document.querySelector('#open-settings').onclick !== null")
            if width < 700:
                page.locator("#toggle-sidebar").click()
            page.locator("#open-settings").click()
            page.locator("#nav-remote").click()
            assert page.locator("#remote-panel").is_visible()
            assert not page.locator("#defaults-panel").is_visible()
            assert page.locator("#remote-email").get_attribute("readonly") is not None
            assert page.evaluate("document.querySelector('#settings').scrollWidth <= document.querySelector('#settings').clientWidth")
            page.locator("#nav-defaults").click()
            assert page.locator("#defaults-panel").is_visible()
            page.keyboard.press("Escape")
            assert not page.locator("#settings").is_visible()
            page.close()
            print(f"remote settings {width}px: PASS")
        browser.close()
finally:
    process.terminate()
    process.wait(timeout=10)
