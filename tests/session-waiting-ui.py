"""Real Chromium status colors, semantics and live transitions; isolated preview, no model."""
from pathlib import Path
import json, os, shutil, socket, subprocess, sys, time, urllib.request
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(sys.argv[1]).resolve()
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
        errors, metrics = [], []
        for width, height in [(1440, 1000), (390, 844), (320, 640)]:
            context = browser.new_context(viewport={'width': width, 'height': height}, has_touch=width < 700)
            context.add_init_script('''
              const NativeSocket = window.WebSocket;
              window.previewSockets = [];
              window.WebSocket = class extends NativeSocket {
                constructor(...args) { super(...args); window.previewSockets.push(this); }
              };
            ''')
            page = context.new_page()
            page.on('pageerror', lambda e: errors.append(str(e)))
            for session in ['ui-confirmation', 'ui-todo-confirmation']:
                page.goto(url + '/#session=' + session); page.reload()
                state = page.locator('#session-state')
                expect(state).to_have_text('等待确认')
                row = page.locator(f'.session-row[data-session-id="{session}"] .session-item > small')
                expect(row).to_have_attribute('aria-label', '等待用户确认')
                for theme, expected in [('dark', 'rgb(226, 185, 120)'), ('light', 'rgb(131, 88, 10)')]:
                    page.evaluate('(theme) => document.documentElement.dataset.theme = theme', theme)
                    expect(state).to_be_visible()
                    expect(state).to_have_css('color', expected)
                    point_display = state.evaluate('(e) => getComputedStyle(e, "::before").display')
                    assert (point_display == 'none') == (width <= 700), (width, point_display)
                    expect(row).to_have_css('background-color', expected)
                    point = state.evaluate('(e) => getComputedStyle(e, "::before").backgroundColor')
                    assert point == expected, point
                    green = page.locator('.session-row[data-session-id="ui-waiting"] .session-running-dot')
                    assert green.evaluate('(e) => getComputedStyle(e).backgroundColor') != expected
                    assert state.evaluate('(e) => getComputedStyle(e, "::before").animationName') == 'none'
                    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
                    bounds = state.bounding_box()
                    assert bounds and bounds['y'] + bounds['height'] <= height
                    metrics.append({'session': session, 'width': width, 'theme': theme, 'color': expected})
                    page.screenshot(path=str(OUT / f'{session}-{width}-{theme}.png'))
                if width <= 700:
                    page.locator('#toggle-sidebar').click()
                    expect(row).to_be_visible()
                    page.screenshot(path=str(OUT / f'{session}-{width}-sidebar.png'))
                    page.locator('#toggle-sidebar').click()
                # Feed server-shaped events through the real transport listener, not DOM edits.
                def emit(kind, data):
                    page.evaluate('''(event) => previewSockets.at(-1).dispatchEvent(new MessageEvent('message', {
                        data: JSON.stringify(event)
                    }))''', {'type': kind, 'sessionId': session, 'data': data})
                emit('question.closed', {'toolCallId': 'preview-confirmation'})
                expect(state).to_have_text('运行中')
                expect(row).to_have_class('session-running-dot')
                expect(row).not_to_have_attribute('hidden', '')
                emit('session.state', {'status': 'idle'})
                expect(state).to_have_text('空闲')
                expect(row).to_have_attribute('hidden', '')
                context.set_offline(True)
                page.evaluate('previewSockets.forEach(socket => socket.close(4001, "fixture disconnect"))')
                expect(state).to_have_text('连接断开')
                context.set_offline(False)
            context.close()
        assert not errors, errors
        (OUT / 'metrics.json').write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding='utf-8')
        browser.close()
finally:
    process.terminate()
    try: process.wait(timeout=10)
    except subprocess.TimeoutExpired: process.kill(); process.wait(timeout=10)
    log.close()
print(f'PASS: confirmation colors, both themes, 3 viewports, live transitions. Artifacts: {OUT}')
