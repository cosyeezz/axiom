"""Isolated navigation/layout regression. No model calls or user data."""
from pathlib import Path
import json, os, shutil, socket, subprocess, sys, time, urllib.request
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else ROOT / '.focus-ui-artifacts'
OUT.mkdir(parents=True, exist_ok=True)
with socket.socket() as sock:
    sock.bind(('127.0.0.1', 0)); port = sock.getsockname()[1]
log = (OUT / 'preview.log').open('w', encoding='utf-8')
process = subprocess.Popen([shutil.which('node'), 'tests/conversation-preview.mjs'], cwd=ROOT,
    env={**os.environ, 'PREVIEW_PORT': str(port)}, stdout=log, stderr=subprocess.STDOUT)
url = f'http://127.0.0.1:{port}'
try:
    for _ in range(100):
        if process.poll() is not None: raise RuntimeError('preview exited')
        try:
            urllib.request.urlopen(url, timeout=1).close(); break
        except OSError: time.sleep(.1)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        metrics, errors = [], []
        for width, height in [(1440, 1000), (768, 900), (390, 844), (320, 640), (1000, 560)]:
            context = browser.new_context(viewport={'width': width, 'height': height}, has_touch=width <= 700)
            context.add_init_script('''
                window.previewSockets = []; window.previewCommands = [];
                const NativeSocket = window.WebSocket;
                window.WebSocket = class extends NativeSocket {
                    constructor(...args) { super(...args); window.previewSockets.push(this); }
                    send(data) {
                        if (typeof data === 'string') window.previewCommands.push(JSON.parse(data).type);
                        super.send(data);
                    }
                };
            ''')
            page = context.new_page()
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.goto(url + '/#session=ui-review')
            page.wait_for_selector('#workspace:not([hidden])')
            page.wait_for_function("document.querySelector('#status').dataset.connected === 'true'")
            phone = width <= 700
            toggle = page.locator('#toggle-sidebar')
            def collapse():
                if toggle.get_attribute('aria-expanded') == 'true': toggle.click()
            def navigation():
                if toggle.get_attribute('aria-expanded') == 'false': toggle.click()
            def settings():
                navigation()
                page.locator('#mobile-more' if phone else '#view-options-trigger').click()
            def tools():
                if width <= 1000:
                    page.locator('.composer-tools-trigger').focus()
                    page.keyboard.press('Enter')
                    expect(page.locator('#context-menu')).to_be_visible()
            for theme in ['dark', 'light']:
                page.evaluate('(theme) => document.documentElement.dataset.theme = theme', theme)
                collapse()
                expect(page.locator('#sidebar')).not_to_be_visible()
                expect(page.locator('main > header')).not_to_be_visible()
                assert page.locator('main').bounding_box()['x'] == 0
                assert page.locator('main').bounding_box()['width'] == width
                assert toggle.evaluate('(el) => el.closest("#composer .actions") !== null')
                assert page.locator('main').evaluate('(el) => !el.inert')
                toggle.focus(); page.keyboard.press('Tab')
                assert page.evaluate('!document.activeElement.closest("#sidebar")')
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
                metrics.append({'width': width, 'theme': theme,
                    'composerHeight': page.locator('.composer-wrap').bounding_box()['height'],
                    'footerHeight': page.locator('#composer-status').bounding_box()['height']})
                page.screenshot(path=str(OUT / f'collapsed-{width}-{theme}.png'))
                navigation()
                expect(page.locator('#search')).to_be_visible()
                if phone:
                    expect(page.locator('#search')).to_be_focused()
                    assert page.locator('main').evaluate('(el) => el.inert')
                    assert page.locator('#session-title').evaluate('(el) => !!el.closest("#sidebar")')
                settings()
                panel = page.locator('#view-options')
                expect(panel).to_be_visible()
                expect(page.locator('#github-link')).to_be_visible()
                if phone:
                    expect(page.locator('#view-options-trigger')).not_to_be_visible()
                    assert panel.get_attribute('popover') is None
                    assert page.locator('main').evaluate('(el) => !el.inert')
                    expect(page.locator('#status span')).to_be_visible()
                    assert page.locator('#status span').evaluate('el => el.getBoundingClientRect().height <= parseFloat(getComputedStyle(el).lineHeight) + 1'), 'connection label must stay on one line'
                else:
                    expect(page.locator('#view-options-trigger')).to_have_attribute('aria-expanded', 'true')
                    page.keyboard.press('Tab')
                    expect(page.locator('#conversation-font-scale')).to_be_focused()
                page.locator('#conversation-font-scale').select_option('125')
                assert page.evaluate('localStorage.getItem("axiom.conversationFontScale")') == '125'
                page.locator('#conversation-font-scale').select_option('100')
                page.locator('#toggle-theme').click()
                assert page.evaluate('document.documentElement.dataset.theme') != theme
                page.locator('#toggle-theme').click()
                page.screenshot(path=str(OUT / f'options-{width}-{theme}.png'))
                page.keyboard.press('Escape')
                expect(panel).not_to_be_visible()
                expect(toggle if phone else page.locator('#view-options-trigger')).to_be_focused()
                settings(); page.locator('#open-raw-io').click()
                expect(page.locator('#raw-io')).to_be_visible()
                page.locator('#close-raw-io').click()
                expect(toggle if phone else page.locator('#view-options-trigger')).to_be_focused()
                collapse()
                page.locator('#session-runtime').click()
                expect(page.locator('#session-usage')).to_have_attribute('open', '')
                expect(page.locator('#session-usage-body')).to_contain_text('5,000 tokens')
                expect(page.locator('#session-usage-body')).to_contain_text('缓存命中率')
                page.keyboard.press('Escape')
                tools(); page.locator('.composer-session-info').click()
                expect(page.locator('#session-inspector')).to_have_attribute('open', '')
                page.keyboard.press('Escape')
                if width <= 1000:
                    tools(); page.keyboard.press('Escape')
                    expect(page.locator('.composer-tools-trigger')).to_be_focused()
                expect(page.locator('#session-state')).to_have_text('空闲')
                expect(page.locator('#task-timer-value')).to_contain_text('耗时')
                for selector in ['#toggle-sidebar', '.composer-model-trigger', '.composer-split', '#session-runtime', '#session-billing-trigger']:
                    box = page.locator(selector).bounding_box()
                    assert box and box['x'] >= 0 and box['x'] + box['width'] <= width + 1, (selector, box)
                    assert box['y'] + box['height'] <= height
                    if phone: assert box['height'] >= 44, (selector, box)
                model = page.locator('.composer-model-name')
                original = model.inner_text()
                model.evaluate('(el) => el.textContent = "long-model-name-that-must-truncate-without-hiding-effort"')
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
                expect(page.locator('.composer-model-effort')).to_be_visible()
                model.evaluate('(el, text) => el.textContent = text', original)
            page.goto(url + '/#session=ui-waiting'); page.reload()
            expect(page.locator('#composer-action-help')).to_contain_text('按钮执行 stop')
            page.evaluate('previewCommands.length = 0')
            settings(); page.keyboard.press('Escape'); collapse()
            if width <= 1000: tools(); page.keyboard.press('Escape')
            page.wait_for_timeout(300)
            assert not page.evaluate('previewCommands.some(type => /stop|withdraw|recall/i.test(type))')
            page.screenshot(path=str(OUT / f'running-{width}.png'))
            if phone: settings()
            else: navigation()
            page.locator('#status').click()
            expect(page.locator('#connection-current')).to_be_visible()
            page.keyboard.press('Escape')
            context.set_offline(True)
            page.evaluate('previewSockets.forEach(socket => socket.close(4001, "fixture disconnect"))')
            expect(page.locator('#session-state')).to_have_text('连接断开')
            if phone: settings()
            else: navigation()
            expect(page.locator('#status span')).to_be_visible()
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            page.screenshot(path=str(OUT / f'disconnected-{width}.png'))
            context.close()
        # First connection failure: workspace never mounts, but navigation/settings remain reachable.
        for width in [320, 1440]:
            context = browser.new_context(viewport={'width': width, 'height': 640})
            context.add_init_script('''
                const NativeSocket = window.WebSocket;
                window.WebSocket = class extends NativeSocket {
                    constructor() { super('ws://127.0.0.1:1'); }
                };
            ''')
            page = context.new_page()
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.goto(url)
            expect(page.locator('#workspace')).not_to_be_visible()
            toggle = page.locator('#toggle-sidebar')
            if toggle.get_attribute('aria-expanded') == 'true': toggle.click()
            expect(page.locator('#sidebar-reopen #toggle-sidebar')).to_be_visible()
            toggle.click()
            expect(page.locator('#search')).to_be_visible()
            if width <= 700: page.locator('#mobile-more').click()
            page.locator('#status').click()
            expect(page.locator('#connection-current')).to_be_visible()
            page.screenshot(path=str(OUT / f'initial-disconnected-{width}.png'))
            context.close()
        assert not errors, errors
        (OUT / 'metrics.json').write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding='utf-8')
        browser.close()
finally:
    process.terminate()
    try: process.wait(timeout=10)
    except subprocess.TimeoutExpired: process.kill(); process.wait(timeout=10)
    log.close()
print(f'PASS: full-width navigation, flat menus, keyboard/focus, 5 viewports, both themes. Artifacts: {OUT}')
