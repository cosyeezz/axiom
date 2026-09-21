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
            metrics = icons.evaluate_all('''nodes => nodes.map(svg => {
                const box = svg.getBoundingClientRect();
                const button = svg.closest('button').getBoundingClientRect();
                return {
                    width: box.width,
                    height: box.height,
                    stroke: getComputedStyle(svg).strokeWidth,
                    color: getComputedStyle(svg).color,
                    background: getComputedStyle(svg.closest('button')).backgroundColor,
                    offsetY: Math.round(((box.top + box.bottom) / 2 - (button.top + button.bottom) / 2) * 10) / 10,
                    overflow: Math.round(Math.max(0, box.bottom - button.bottom) * 10) / 10,
                };
            })''')
            assert all(m['width'] == 20 and m['height'] == 20 for m in metrics), metrics
            assert all(m['stroke'] == '1.75px' for m in metrics), metrics
            assert len(set(m['background'] for m in metrics)) == 1, metrics
            # Every glyph is optically centred in its own button, including the one
            # that lives outside .icon-group, and none bleeds past the button edge.
            assert all(m['offsetY'] == 0 for m in metrics), metrics
            assert all(m['overflow'] == 0 for m in metrics), metrics
            # Toolbar hue stays single: colour is not what tells these tools apart.
            assert len(set(m['color'] for m in metrics)) == 1, metrics
            # Hover must be actually perceptible against the composer surface. --raised was
            # only 1.33:1 in dark and 1.06:1 in light, i.e. invisible.
            button = page.locator('#compact-session')
            rest = button.evaluate("el => getComputedStyle(el).backgroundColor")
            button.hover()
            page.wait_for_timeout(120)
            hover = button.evaluate("el => getComputedStyle(el).backgroundColor")
            assert hover != rest, (theme, rest, hover)
            assert 'rgba' not in hover or not hover.endswith(', 0)'), (theme, hover)
            page.mouse.move(0, 0)
            page.wait_for_timeout(120)
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
