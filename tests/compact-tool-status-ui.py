"""Chromium regression for compact tool rows and shared runtime metrics; no real model/tool calls."""
from pathlib import Path
import json, os, shutil, socket, subprocess, sys, time, urllib.request
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(os.environ.get('TEMP', '/tmp')) / 'axiom-compact-tool-status'
OUT.mkdir(parents=True, exist_ok=True)
with socket.socket() as sock:
    sock.bind(('127.0.0.1', 0)); port = sock.getsockname()[1]
log = (OUT / 'preview.log').open('w', encoding='utf-8')
server = subprocess.Popen([shutil.which('node'), 'tests/conversation-preview.mjs'], cwd=ROOT,
    env={**os.environ, 'PREVIEW_PORT': str(port)}, stdout=log, stderr=subprocess.STDOUT)
url = f'http://127.0.0.1:{port}'
try:
    for _ in range(100):
        if server.poll() is not None: raise RuntimeError('preview exited')
        try:
            urllib.request.urlopen(url, timeout=1).close(); break
        except OSError: time.sleep(.1)
    else: raise RuntimeError('preview did not start')
    with sync_playwright() as p:
        browser = p.chromium.launch()
        errors, metrics = [], []
        for width, touch in [(320, True), (390, True), (700, True), (768, False), (1440, False), (1024, True)]:
            context = browser.new_context(viewport={'width': width, 'height': 900}, has_touch=touch)
            page = context.new_page()
            page.on('pageerror', lambda error: errors.append(str(error)))
            for theme in ['dark', 'light']:
                page.goto(url + '/#session=ui-density'); page.reload()
                page.wait_for_selector('#workspace:not([hidden])')
                page.evaluate('(theme) => document.documentElement.dataset.theme = theme', theme)
                for group in page.locator('#output .call-group:not([open]) > summary').all(): group.click()
                page.wait_for_timeout(100)
                rows = page.locator('#output .tool-record')
                assert rows.count() == 6
                for row in rows.all():
                    summary = row.locator('summary')
                    label, target, status = [row.locator(s) for s in ['.activity-label', '.tool-target', '.tool-status']]
                    a, b, c = [n.bounding_box() for n in [label, target, status]]
                    assert abs(a['y'] + a['height']/2 - b['y'] - b['height']/2) < 1, (width, a, b)
                    assert a['x'] + a['width'] <= b['x'] + 1 and b['x'] + b['width'] <= c['x'] + 1
                    assert status.evaluate('el => el.scrollWidth <= el.clientWidth + 1'), (width, status.inner_text())
                    assert summary.bounding_box()['height'] == (44 if width <= 700 else 36)
                short = rows.nth(1).locator('.tool-target')
                assert short.evaluate('el => el.scrollWidth <= el.clientWidth'), (width, 'todo.read clipped')
                assert rows.nth(2).locator('.tool-target').evaluate('el => getComputedStyle(el).textOverflow') == 'ellipsis'
                expect(rows.nth(3).locator('.tool-status')).to_contain_text('FAILED')
                timeout = rows.nth(4).locator('.tool-timeout')
                assert timeout.is_visible() == (width > 700)
                assert '时限' in rows.nth(4).locator('.tool-status').get_attribute('title')
                # Native keyboard disclosure still exposes full parameters/results.
                rows.nth(2).locator('summary').focus(); page.keyboard.press('Enter')
                expect(rows.nth(2).locator('.tool-detail')).to_contain_text('mcp.server.an-extremely-long-instruction-name')
                expect(rows.nth(2).locator('.tool-detail')).to_contain_text('隔离预览结果')
                page.keyboard.press('Space')
                assert not rows.nth(2).evaluate('el => el.open')
                footer = page.locator('#composer-status').bounding_box()
                composer = page.locator('#composer').bounding_box()
                assert 0 <= footer['y'] - composer['y'] - composer['height'] <= 4
                runtime = page.locator('#session-runtime')
                assert runtime.locator('svg').count() == 2
                assert runtime.locator('.runtime-context-percent').is_visible() == (width <= 700)
                assert runtime.locator('.runtime-context-detail').is_visible() == (width > 700)
                if width <= 700:
                    assert runtime.bounding_box()['height'] == 44
                    cache, occupancy = [runtime.locator('.runtime-' + name).bounding_box() for name in ['cache', 'context']]
                    assert abs(cache['y'] - occupancy['y']) < 1
                if touch: assert runtime.bounding_box()['height'] >= 44
                runtime.click()
                expect(page.locator('#session-usage-body')).to_contain_text('5,000 tokens')
                page.keyboard.press('Escape')
                # Shared child metrics and tool summary use the same responsive rules.
                page.locator('.task-card').click()
                dialog = page.locator('.task-dialog[open]')
                expect(dialog.locator('.runtime-summary .runtime-cache svg')).to_be_visible()
                for group in dialog.locator('.call-group:not([open]) > summary').all(): group.click()
                child_target = dialog.locator('.tool-target').nth(1)
                assert child_target.is_visible()
                assert dialog.locator('.tool-record > summary').nth(1).bounding_box()['height'] == (44 if width <= 700 else 36)
                assert dialog.locator('.runtime-context-percent').is_visible() == (width <= 700)
                usage_summary = dialog.locator('.task-usage > summary')
                if touch: usage_summary.tap()
                else:
                    usage_summary.focus(); page.keyboard.press('Enter')
                expect(dialog.locator('.task-usage-body')).to_be_visible()
                expect(dialog.locator('.task-usage-body')).to_contain_text('5,000 tokens')
                expect(dialog.locator('.task-usage-body')).to_contain_text('128,000 tokens')
                page.keyboard.press('Escape')
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
                metrics.append({'width': width, 'touch': touch, 'theme': theme, 'toolHeight': rows.first.bounding_box()['height'], 'footerHeight': footer['height']})
                page.locator('#transcript').evaluate('el => el.scrollTop = el.scrollHeight')
                page.screenshot(path=str(OUT / f'compact-{width}-{theme}.png'))
            page.goto(url + '/#session=ui-density-running'); page.reload()
            running = page.locator('#output .tool-activity[data-state="running"]')
            expect(running).to_be_visible()
            a, b = [running.locator(s).bounding_box() for s in ['.activity-label', '.tool-target']]
            assert abs(a['y'] + a['height']/2 - b['y'] - b['height']/2) < 1
            assert running.locator('.tool-status').evaluate('el => el.scrollWidth <= el.clientWidth + 1')
            if width == 1440:
                page.evaluate("document.documentElement.dataset.conversationFontScale = '200'")
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            for suffix, percent, detail in [('estimated', '≈ 12.3%', '≈ 1,234 / 10,000 · 12.3%'),
                                             ('unknown-window', '—', '≈ 1,234 tokens · 窗口未知')]:
                page.goto(url + '/#session=ui-density-' + suffix); page.reload()
                metric = page.locator('#session-runtime .runtime-context-percent' if width <= 700 else '#session-runtime .runtime-context-detail')
                expect(metric).to_be_visible()
                expect(metric).to_have_text(percent if width <= 700 else detail)
                page.locator('.task-card').click()
                dialog = page.locator('.task-dialog[open]')
                child_metric = dialog.locator('.runtime-context-percent' if width <= 700 else '.runtime-context-detail')
                expect(child_metric).to_have_text(percent if width <= 700 else detail)
                summary = dialog.locator('.task-usage > summary')
                if touch: summary.tap()
                else:
                    summary.focus(); page.keyboard.press('Enter')
                expect(dialog.locator('.task-usage-body')).to_be_visible()
                expect(dialog.locator('.task-usage-body')).to_contain_text('当前上下文（估算）：1,234 tokens')
                expect(dialog.locator('.task-usage-body')).to_contain_text('未配置' if suffix == 'unknown-window' else '10,000 tokens')
                assert summary.bounding_box()['height'] >= 44
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
                page.keyboard.press('Escape')
            context.close()
        assert not errors, errors
        (OUT / 'metrics.json').write_text(json.dumps(metrics, indent=2), encoding='utf-8')
        browser.close()
finally:
    server.terminate()
    try: server.wait(timeout=10)
    except subprocess.TimeoutExpired: server.kill(); server.wait(timeout=10)
    log.close()
print(f'PASS: compact tool/status layout, six viewport/input combinations, both themes. {OUT}')
