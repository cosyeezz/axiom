"""Real browser regression for composer icon size, colors and theme consistency."""
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
from urllib.request import urlopen
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
with socket.socket() as sock:
    sock.bind(('127.0.0.1', 0))
    port = sock.getsockname()[1]
server = subprocess.Popen(['node', 'tests/frontend-regions-preview.mjs'], cwd=root,
                          env={**os.environ, 'PREVIEW_PORT': str(port)}, stdout=subprocess.DEVNULL)
artifacts = Path(tempfile.gettempdir()) / 'axiom-composer-icons'
artifacts.mkdir(exist_ok=True)
try:
    url = f'http://127.0.0.1:{port}'
    for _ in range(100):
        try:
            urlopen(url, timeout=1).close()
            break
        except OSError:
            time.sleep(.1)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={'width': 1440, 'height': 1000}, device_scale_factor=2)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(url)
        page.locator('#prompt').click()
        page.wait_for_function("document.querySelector('.composer-wrap').dataset.collapsed === 'false'")
        for theme in ['dark', 'light']:
            page.evaluate('(theme) => document.documentElement.dataset.theme = theme', theme)
            page.wait_for_timeout(250)
            icons = page.locator('.context-bar .composer-icon')
            assert icons.count() == 5
            metrics = icons.evaluate_all('''nodes => nodes.map(svg => ({
                width: svg.getBoundingClientRect().width,
                height: svg.getBoundingClientRect().height,
                stroke: getComputedStyle(svg).strokeWidth,
                color: getComputedStyle(svg.lastElementChild).stroke,
                background: getComputedStyle(svg.closest('button')).backgroundColor
            }))''')
            assert all(m['width'] == 20 and m['height'] == 20 for m in metrics), metrics
            assert all(m['stroke'] == '1.65px' for m in metrics), metrics
            assert len(set(m['background'] for m in metrics)) == 1, metrics
            assert all(m['color'] not in ['none', 'rgb(0, 0, 0)'] for m in metrics), metrics
            page.locator('.composer-wrap').screenshot(path=str(artifacts / f'{theme}.png'))
        page.set_viewport_size({'width': 390, 'height': 844})
        page.wait_for_timeout(250)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.locator('.composer-wrap').screenshot(path=str(artifacts / 'mobile.png'))
        assert not errors, errors
        browser.close()
    print(f'Composer icons: dark/light/mobile passed; screenshots: {artifacts}')
finally:
    server.terminate()
    server.wait(timeout=10)
