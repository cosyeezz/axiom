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
        for width, touch in [(320, False), (390, False), (768, False), (1280, False), (390, True)]:
            page = browser.new_page(viewport={'width': width, 'height': 1000}, has_touch=touch)
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            for attempt in range(40):
                try:
                    page.goto(f'http://127.0.0.1:{port}/#session=ui-billing')
                    break
                except Exception:
                    time.sleep(.2)
            page.wait_for_selector('#workspace:not([hidden])')
            if width <= 700:
                page.locator('#mobile-expand').click()
            else:
                # 桌面输入区默认折叠，动作区与详情入口都收着；量对齐前先按真实路径点输入框展开。
                page.locator('#prompt').click()
                page.wait_for_function("() => document.getElementById('composer').dataset.collapsed === 'false'")
                page.wait_for_timeout(120)
            rows = page.locator('.session-detail-rows').bounding_box()
            stats = page.locator('#session-runtime').bounding_box()
            assert abs(rows['x'] - (stats['x'] + 12)) <= .5, 'left alignment'
            assert abs(rows['x'] + rows['width'] - (stats['x'] + stats['width'] - 12)) <= .5, 'right alignment'
            for row in page.locator('.session-detail-row').all():
                assert abs(row.bounding_box()['height'] - (44 if touch else 36)) <= .5, 'compact / touch row height'
            page.locator('#session-inspector-trigger').click()
            page.locator('#inspector-tools-tab').click()
            page.locator('.inspector-tool > summary').click()
            assert page.locator('.json-string').count() > 0
            page.locator('#session-detail-close').click()
            page.locator('#session-billing-trigger').click()
            page.locator('#session-bill-body .bill-models > summary').click()
            page.locator('#session-bill-body .bill-model > summary').click()
            bill = page.locator('#session-bill-body').inner_text()
            for text in ['$0.023', '$0.012', '$0.006', '$0.005', '2 个子代理', '4 条用量记录']:
                assert text in bill, text
            page.screenshot(path=str(Path(tempfile.gettempdir()) / f'axiom-billing-detail-{width}.png'))
            page.locator('#session-detail-close').click()
            assert '80.0%' in page.locator('#session-runtime').inner_text()
            assert page.locator('#session-runtime').is_visible()
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'page overflow {width}'
            assert page.locator('#composer .selectors').evaluate('(el) => el.scrollWidth <= el.clientWidth + 1'), f'selector overflow {width}'
            page.screenshot(path=str(Path(tempfile.gettempdir()) / f'axiom-session-billing-{width}.png'))
            card = page.locator('[aria-controls="task-review"]')
            assert card.locator('.task-cost').inner_text() == '$0.006'
            card.click()
            page.locator('.task-dialog[open] .task-billing > summary').click()
            assert '$0.006' in page.locator('.task-dialog[open] .task-bill-body').inner_text()
            page.screenshot(path=str(Path(tempfile.gettempdir()) / f'axiom-task-billing-{width}.png'))
            page.keyboard.press('Escape')
            assert not errors, errors
            page.close()
            print(f'PASS {width}px touch={touch}: alignment / compact rows / responsive selectors / runtime / tabs / JSON / bill')
        browser.close()
finally:
    server.terminate()
    server.wait(timeout=10)
