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
        for width, height in ((1440, 900), (390, 900), (320, 900), (844, 390)):
            page = browser.new_page(viewport={"width": width, "height": height})
            page.set_default_timeout(10000)
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto(f"http://127.0.0.1:{port}")
            page.wait_for_function("document.querySelector('#open-settings').onclick !== null")
            if width < 700:
                page.locator("#toggle-sidebar").click()
            page.locator("#open-settings").click()
            bounds = page.locator("#settings").bounding_box()
            assert abs(bounds["height"] - height * 0.8) <= 1, bounds
            assert abs(bounds["y"] - height * 0.1) <= 1, bounds
            for tab in ("service", "remote", "models", "defaults", "service"):
                page.locator(f"#settings-{tab}-tab").click()
                assert page.locator("#settings").bounding_box() == bounds
            # 长内容只滚动设置内部；标题和关闭按钮不移动。
            header = page.locator("#settings > header").bounding_box()
            page.locator("#service-history").evaluate("el => el.textContent = '长内容 '.repeat(5000)")
            page.locator(".settings-layout").evaluate("el => el.scrollTop = el.scrollHeight")
            assert page.locator(".settings-layout").evaluate("el => el.scrollTop > 0")
            assert page.locator("#settings").bounding_box() == bounds
            assert page.locator("#settings > header").bounding_box() == header
            page.locator("#service-history").evaluate("el => el.textContent = ''")
            page.locator(".settings-layout").evaluate("el => el.scrollTop = 0")
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
            print(f"service settings {width}x{height}px: PASS")
        browser.close()
finally:
    process.terminate()
    process.wait(timeout=10)
