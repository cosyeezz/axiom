"""Isolated fake-data UI: responsive composer, inspector and bill; no model calls."""
import os
import socket
import subprocess
import tempfile
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
with socket.socket() as sock:
    sock.bind(('127.0.0.1', 0))
    port = sock.getsockname()[1]
env = {**os.environ, 'PREVIEW_PORT': str(port)}
server = subprocess.Popen(['node', 'tests/conversation-preview.mjs'], cwd=ROOT, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
try:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for width in [320, 390, 768, 1280]:
            page = browser.new_page(viewport={'width': width, 'height': 1000})
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            for attempt in range(40):
                try:
                    page.goto(f'http://127.0.0.1:{port}')
                    break
                except Exception:
                    time.sleep(.2)
            page.wait_for_selector('#workspace:not([hidden])')
            if width <= 700:
                page.locator('#mobile-expand').click()
            page.locator('#session-inspector > summary').click()
            page.locator('#inspector-tools-tab').click()
            page.locator('.inspector-tool > summary').click()
            assert page.locator('.json-string').count() > 0
            page.locator('#session-billing > summary').click()
            page.locator('.bill-model > summary').click()
            assert '$0.012000' in page.locator('#session-bill-body').inner_text()
            assert '80.0%' in page.locator('#session-runtime').inner_text()
            assert page.locator('#session-runtime').is_visible()
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'page overflow {width}'
            assert page.locator('#composer .selectors').evaluate('(el) => el.scrollWidth <= el.clientWidth + 1'), f'selector overflow {width}'
            page.screenshot(path=str(Path(tempfile.gettempdir()) / f'axiom-session-billing-{width}.png'))
            assert not errors, errors
            page.close()
            print(f'PASS {width}px: responsive selectors / runtime / tabs / JSON / bill')
        browser.close()
finally:
    server.terminate()
    server.wait(timeout=10)
