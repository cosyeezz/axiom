"""Isolated layout checks. python tests/focus-ui-browser.py [artifacts] [baseline-root]. No model/user data."""
from pathlib import Path
import json, os, shutil, socket, subprocess, sys, time, urllib.request
from playwright.sync_api import sync_playwright, expect

ROOT = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else Path(__file__).resolve().parents[1]
BASELINE = len(sys.argv) > 2
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
            context = browser.new_context(viewport={'width': width, 'height': height}, has_touch=width < 720)
            context.add_init_script('''
                window.previewSockets = [];
                window.previewCommands = [];
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
            def show_tools():
                if width <= 1000 and not page.locator('#composer-tools').is_visible():
                    # Usage dialog restores keyboard focus (and its tooltip); move focus normally.
                    page.locator('.composer-tools-trigger').focus()
                    page.keyboard.press('Enter')
                    expect(page.locator('#composer-tools')).to_be_visible()
            def close_tools():
                if width <= 1000 and page.locator('#composer-tools').is_visible():
                    page.keyboard.press('Escape')
                    expect(page.locator('#composer-tools')).not_to_be_visible()
                    expect(page.locator('.composer-tools-trigger')).to_be_focused()
            for theme in ['dark', 'light']:
                page.evaluate('(theme) => document.documentElement.dataset.theme = theme', theme)
                page.wait_for_timeout(120)
                metrics.append({'width': width, 'height': height, 'theme': theme,
                    'composerHeight': page.locator('.composer-wrap').bounding_box()['height'],
                    'sidebarWidth': page.locator('#sidebar').bounding_box()['width']})
                page.screenshot(path=str(OUT / f'workspace-{width}-{theme}.png'))
                if BASELINE: continue
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (width, theme)
                expect(page.locator('#github-link')).not_to_be_visible()
                assert page.locator('#composer-help, .composer-help-trigger').count() == 0
                expect(page.locator('#composer-action-help')).not_to_be_visible()
                phone = width <= 700
                # Navigation owns the controls, including a usable rail after folding.
                assert page.locator('main > header #toggle-sidebar, main > header .service-controls, main > header #mobile-more').count() == 0
                toggle = page.locator('#toggle-sidebar')
                if toggle.get_attribute('aria-expanded') == 'true': toggle.click()
                expect(toggle).to_have_attribute('aria-label', '展开侧栏')
                expect(page.locator('#search')).not_to_be_visible()
                assert page.locator('#sidebar').bounding_box()['width'] == 56
                assert page.locator('main').evaluate('(e) => !e.inert')
                for selector in ['#toggle-sidebar', '#mobile-more' if phone else '#view-options-trigger']:
                    control = page.locator(selector)
                    expect(control.locator('svg')).to_be_visible()
                    bounds = control.bounding_box()
                    assert 0 <= bounds['x'] and bounds['x'] + bounds['width'] <= 57
                    assert bounds['y'] >= 0 and bounds['y'] + bounds['height'] <= height
                expect(page.locator('#session-state')).to_have_text('空闲')
                page.screenshot(path=str(OUT / f'collapsed-{width}-{theme}.png'))
                if not phone:
                    page.locator('#view-options-trigger').click()
                    expect(page.locator('#github-link')).to_be_visible()
                    page.keyboard.press('Escape')
                    page.locator('#status').click()
                    expect(page.locator('#connection-current')).to_be_visible()
                    page.keyboard.press('Escape')
                toggle.focus(); page.keyboard.press('Enter')
                expect(page.locator('#search')).to_be_visible()
                if phone:
                    expect(page.locator('#search')).to_be_focused()
                    assert page.locator('main').evaluate('(e) => e.inert')
                    # Opening more from the expanded drawer must release the main region.
                    page.locator('#mobile-more').click()
                    assert page.locator('main').evaluate('(e) => !e.inert')
                    page.keyboard.press('Escape')
                    expect(page.locator('#mobile-more')).to_be_focused()
                if phone:
                    expect(page.locator('#status')).not_to_be_visible()
                    page.locator('#mobile-more').click()
                expect(page.locator('#status')).to_be_visible()
                expect(page.locator('.composer-model-effort')).to_be_visible()
                for selector in ['#view-options-trigger', '#session-runtime', '.composer-split', '.composer-model-trigger']:
                    bounds = page.locator(selector).bounding_box()
                    assert bounds and bounds['x'] >= 0 and bounds['x'] + bounds['width'] <= width + 1, (selector, bounds)
                # Native disclosure keyboard, light-dismiss and focus return.
                more = page.locator('#view-options-trigger')
                more.focus(); page.keyboard.press('Enter')
                panel = page.locator('#view-options')
                expect(panel).to_be_visible()
                expect(more).to_have_attribute('aria-expanded', 'true')
                assert panel.evaluate('(e) => e.scrollWidth <= e.clientWidth + 1')
                page.keyboard.press('Tab')
                expect(page.locator('#conversation-font-scale')).to_be_focused()
                page.keyboard.press('Shift+Tab')
                expect(more).to_be_focused()
                expect(panel.locator('#github-link')).to_be_visible()
                page.screenshot(path=str(OUT / f'options-{width}-{theme}.png'))
                page.locator('#conversation-font-scale').select_option('125')
                assert page.evaluate('localStorage.getItem("axiom.conversationFontScale")') == '125'
                page.locator('#conversation-font-scale').select_option('100')
                page.locator('#toggle-theme').click()
                assert page.evaluate('document.documentElement.dataset.theme') != theme
                page.locator('#toggle-theme').click()
                page.keyboard.press('Escape')
                expect(panel).not_to_be_visible()
                expect(more).to_be_focused()
                more.click()
                # Light-dismiss from the dialog's bottom-right padding, outside the upward panel.
                if phone:
                    bounds = page.locator('#mobile-menu').bounding_box()
                    page.locator('#mobile-menu').click(position={'x': bounds['width'] - 8, 'y': bounds['height'] - 8})
                else:
                    page.locator('#prompt').click()
                expect(panel).not_to_be_visible()
                more.click(); page.locator('#open-raw-io').click()
                expect(panel).not_to_be_visible()
                expect(page.locator('#raw-io')).to_be_visible()
                page.locator('#close-raw-io').click()
                expect(page.locator('#mobile-more') if phone else more).to_be_focused()
                page.locator('#session-runtime').click()
                expect(page.locator('#session-usage')).to_have_attribute('open', '')
                expect(page.locator('#session-usage-body')).to_contain_text('5,000 tokens')
                expect(page.locator('#session-usage-body')).to_contain_text('缓存命中率')
                page.keyboard.press('Escape')
                show_tools()
                page.locator('.composer-session-info').click()
                expect(page.locator('#session-inspector')).to_have_attribute('open', '')
                page.locator('#session-billing > summary').click()
                expect(page.locator('#session-billing')).to_have_attribute('open', '')
                page.keyboard.press('Escape')
                show_tools()
                for selector in ['.composer-session-info']:
                    bounds = page.locator(selector).bounding_box()
                    assert bounds and bounds['x'] >= 0 and bounds['x'] + bounds['width'] <= width + 1, (selector, bounds)
                    if width < 720: assert bounds['height'] >= 44, selector
                close_tools()
                assert page.locator('#session-runtime').evaluate('(e) => e.parentElement.id') == 'composer-status'
                prompt_bounds = page.locator('#prompt').bounding_box()
                action_bounds = page.locator('.composer-split').bounding_box()
                assert prompt_bounds['y'] + prompt_bounds['height'] <= action_bounds['y']
                assert action_bounds['y'] + action_bounds['height'] <= height
                model_name = page.locator('.composer-model-name')
                original = model_name.inner_text()
                model_name.evaluate('(e) => e.textContent = "long-model-name-that-must-truncate-without-hiding-effort"')
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
                expect(page.locator('.composer-model-effort')).to_be_visible()
                bounds = page.locator('.composer-split').bounding_box()
                assert bounds['x'] + bounds['width'] <= width + 1
                model_name.evaluate('(e, text) => e.textContent = text', original)
                if phone:
                    for selector in ['#mobile-more', '.composer-model-trigger', '#session-runtime']:
                        assert page.locator(selector).bounding_box()['height'] >= 44, selector
                    page.locator('#mobile-more').click()
                    for selector in ['#status', '#view-options-trigger']:
                        assert page.locator(selector).bounding_box()['height'] >= 44, selector
                    page.keyboard.press('Escape')
            if not BASELINE:
                page.goto(url + '/#session=ui-waiting')
                page.reload()  # Hash-only navigation does not bootstrap another session.
                expect(page.locator('#composer-action-help')).to_have_class('sr-only')
                assert page.locator('#composer-action-help').evaluate("el => getComputedStyle(el).clip === 'rect(0px, 0px, 0px, 0px)'")
                expect(page.locator('#composer-action-help')).to_contain_text('Enter 介入')
                expect(page.locator('#composer-action-help')).to_contain_text('按钮执行 stop')
                page.evaluate('previewCommands.length = 0')
                if phone: page.locator('#mobile-more').click()
                for selector in ['#view-options-trigger']:
                    page.locator(selector).focus(); page.keyboard.press('Enter')
                    page.keyboard.press('Escape')
                    expect(page.locator(selector)).to_be_focused()
                    if phone and selector == '#view-options-trigger':
                        expect(page.locator('#mobile-menu')).to_be_visible()
                        page.keyboard.press('Escape')
                    close_tools()
                page.wait_for_timeout(400)
                assert not page.evaluate('previewCommands.some(type => /stop|withdraw|recall/i.test(type))')
                expect(page.locator('#composer-action-help')).to_contain_text('按钮执行 stop')
                page.screenshot(path=str(OUT / f'running-{width}.png'))
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
                page.emulate_media(reduced_motion='reduce')
                # Connection settings stay reachable, including on narrow viewports.
                if phone: page.locator('#mobile-more').click()
                page.locator('#status').click()
                expect(page.locator('#connection-current')).to_be_visible()
                page.keyboard.press('Escape')
                context.set_offline(True)
                # Offline emulation does not close an already established WebSocket.
                page.evaluate('previewSockets.forEach(socket => socket.close(4001, "fixture disconnect"))')
                expect(page.locator('#status')).not_to_have_attribute('data-connected', 'true')
                if phone: page.locator('#mobile-more').click()
                expect(page.locator('#status span')).to_be_visible()
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
                page.screenshot(path=str(OUT / f'disconnected-{width}.png'))
            context.close()
        assert not errors, errors
        (OUT / 'metrics.json').write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding='utf-8')
        browser.close()
finally:
    process.terminate()
    try: process.wait(timeout=10)
    except subprocess.TimeoutExpired: process.kill(); process.wait(timeout=10)
    log.close()
print(f'PASS: focused layout, 5 viewports, both themes. Baseline={BASELINE}. Artifacts: {OUT}')
