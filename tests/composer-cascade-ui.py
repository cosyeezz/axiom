"""Isolated Chromium regression; starts and stops its own preview server."""
import os
import subprocess
import time
import urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

server = subprocess.Popen(['node', 'tests/model-selection-preview.mjs'], env={**os.environ, 'PREVIEW_PORT': '4348'}, stdout=subprocess.DEVNULL)
try:
    for _ in range(100):
        try:
            urllib.request.urlopen('http://127.0.0.1:4348', timeout=1)
            break
        except OSError:
            time.sleep(.1)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={'width': 1440, 'height': 1000})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto('http://127.0.0.1:4348')
        trigger = page.locator('.composer-model-trigger')
        trigger.wait_for()
        page.wait_for_function("!document.querySelector('.composer-model-trigger').disabled")
        trigger.click()
        root = page.locator('body > .composer-model-panel')
        before = root.bounding_box()
        root.locator(':scope > section .composer-choice-row > button:first-child').first.click()
        panels = page.locator('.composer-model-panel:popover-open')
        assert panels.count() == 2
        assert root.bounding_box() == before, 'provider panel moved'
        second = panels.nth(1)
        second_before = second.bounding_box()
        second.locator('input').press('ArrowDown')
        assert second.locator(':focus').count() == 1, 'keyboard navigation escaped child panel'
        second.locator(':scope > section .composer-choice-row > button:first-child').first.click()
        assert panels.count() == 3
        assert root.bounding_box() == before
        assert second.bounding_box() == second_before, 'model panel moved'
        last = panels.nth(2)
        assert last.locator('path[d="m10 6 6 6-6 6"]').count() == 0
        last.locator('.composer-favorite').first.click()
        page.wait_for_timeout(300)
        assert panels.count() == 3
        Path('artifacts/composer').mkdir(parents=True, exist_ok=True)
        page.screenshot(path='artifacts/composer/cascade-desktop.png')
        last.locator('.composer-choice-row > button:first-child').first.click()
        page.wait_for_timeout(300)
        assert panels.count() == 0
        for width in [390, 320]:
            page.set_viewport_size({'width': width, 'height': 844})
            page.wait_for_timeout(150)
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        assert not errors, errors
        browser.close()
    print('Composer browser checks passed')
finally:
    server.terminate()
    server.wait(timeout=15)
