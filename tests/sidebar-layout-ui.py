"""Isolated sidebar layout + existing session regressions; no user/model data.
python tests/sidebar-layout-ui.py [artifacts]
"""
from pathlib import Path
import json, os, shutil, socket, subprocess, sys, time, urllib.request
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else ROOT / '.sidebar-layout-artifacts'
OUT.mkdir(parents=True, exist_ok=True)
with socket.socket() as sock:
    sock.bind(('127.0.0.1', 0)); port = sock.getsockname()[1]
url = f'http://127.0.0.1:{port}'
log = (OUT / 'preview.log').open('w', encoding='utf-8')
process = subprocess.Popen([shutil.which('node'), 'tests/conversation-preview.mjs'], cwd=ROOT,
    env={**os.environ, 'PREVIEW_PORT': str(port)}, stdout=log, stderr=subprocess.STDOUT)
try:
    for _ in range(100):
        if process.poll() is not None: raise RuntimeError('preview exited')
        try:
            urllib.request.urlopen(url, timeout=1).close(); break
        except OSError: time.sleep(.1)
    # Existing tests use separate browser contexts; duplication runs only once per fresh server.
    env = {**os.environ, 'AXIOM_PREVIEW_URL': url, 'AXIOM_SEARCH_ARTIFACTS': str(OUT / 'search'),
           'AXIOM_SIDEBAR_SCREENSHOT': str(OUT / 'sessions.png')}
    for script in ['session-sidebar-ui.py', 'session-search-ui.py']:
        subprocess.run([sys.executable, str(ROOT / 'tests' / script)], env=env, check=True, timeout=180)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        metrics = []
        for width, height, touch in [(1440, 1000, False), (768, 900, False), (320, 640, True),
                                      (390, 844, True), (667, 375, True), (320, 256, False)]:
            context = browser.new_context(viewport={'width': width, 'height': height}, has_touch=touch)
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            def expose(route):
                response = route.fetch()
                # Leave startup live, then keep synthetic list counts stable across the 5s poll.
                source = response.text().replace('if (connected && !sessionMissing && !changing &&',
                    'if (!window.layoutFixtureActive && connected && !sessionMissing && !changing &&')
                route.fulfill(response=response, body=source + '''
let layoutBase;
window.layoutFixture = (count) => {
  window.layoutFixtureActive = true;
  const base = (layoutBase ??= allSessions[0]);
  allSessions = [...Array.from({length: count}, (_, i) => ({...base, id: `layout-${i}`,
    title: `会话 ${i} · 长列表回归`, cwd: '/one/project', status: 'idle', updatedAt: Date.now() - i * 1000})),
    ...(count ? [{...base, id: 'other-project', title: '同名目录会话', cwd: '/two/project', status: 'idle'}] : [])];
  currentCwd = '/one/project';
  hiddenSessions = new Set(allSessions.filter((_, i) => i % 2 === 1).map(s => s.id));
  seenSessions = {}; pinnedSessions = new Set(); renderSessions();
};
''')
            page.route('**/app.js', expose)
            page.goto(url + '/#session=ui-review')
            page.wait_for_selector('#workspace:not([hidden])')
            page.wait_for_function("document.querySelector('#status').dataset.connected === 'true'")
            for theme in ['dark', 'light']:
                page.evaluate('(theme) => document.documentElement.dataset.theme = theme', theme)
                toggle = page.locator('#toggle-sidebar')
                if toggle.get_attribute('aria-expanded') == 'true': toggle.click()
                expect(page.locator('#sidebar')).not_to_be_visible()
                expect(toggle).to_be_visible()
                box = toggle.bounding_box()
                assert box['height'] >= (44 if touch else 40)
                assert page.locator('main').bounding_box()['width'] == width
                toggle.click()
                expect(page.locator('#new')).to_be_visible()
                page.keyboard.press('Control+k')
                expect(page.locator('#search')).to_be_focused()
                expect(toggle).to_have_attribute('aria-expanded', 'true')
                # Keyboard bypass reaches main and releases mobile inert without changing drafts.
                page.locator('#skip-sidebar').focus()
                page.keyboard.press('Enter')
                expect(page.locator('main')).to_be_focused()
                assert page.locator('main').evaluate('(el) => !el.inert')
                page.keyboard.press('Control+k')
                for count in [0, 1, 50, 500]:
                    page.evaluate('(count) => window.layoutFixture(count)', count)
                    if count:
                        current = page.locator('.workspace-group.current')
                        expect(current.locator('.workspace-path')).to_be_visible()
                        expect(current.locator('.workspace-path')).to_have_text('/one/project')
                        expect(current.locator('.workspace-header')).to_have_attribute('aria-label', '当前工作空间：/one/project')
                        current.locator('.workspace-header').scroll_into_view_if_needed()
                        if not current.evaluate('(el) => el.open'): current.locator('.workspace-header').click()
                        if touch:
                            for selector in ['.workspace-config-btn', '.workspace-new-btn']:
                                box = current.locator(selector).bounding_box()
                                assert box['width'] >= 44 and box['height'] >= 44
                        for summary in current.locator('.session-section:not([open]) > summary').all():
                            summary.click()
                        page.locator('#search').focus()
                        page.keyboard.press('ArrowDown')
                        page.keyboard.press('End')
                        focused = page.locator('.session-item:focus')
                        expect(focused).to_be_visible()
                        box = focused.bounding_box()
                        assert 0 <= box['y'] and box['y'] + box['height'] <= height + 1, (width, height, box)
                        assert current.locator('.session-completed').count() == (1 if count > 1 else 0)
                    else:
                        expect(page.locator('.session-row')).to_have_count(0)
                        expect(page.locator('.workspace-group.current .session-empty')).to_have_text('暂无会话')
                    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (width, height)
                # Search must not make same-basename workspaces ambiguous or lose either scroller.
                scroll_id = '#sidebar' if height <= 500 else '#sessions'
                page.locator(scroll_id).evaluate('(el) => el.scrollTop = 600')
                before_search = page.locator(scroll_id).evaluate('(el) => el.scrollTop')
                assert before_search > 0
                page.keyboard.press('Control+k')
                after_shortcut = page.locator(scroll_id).evaluate('(el) => el.scrollTop')
                page.keyboard.insert_text('会话 498')
                expect(page.locator('.workspace-group')).to_have_count(1)
                expect(page.locator('.workspace-path')).to_be_visible()
                expect(page.locator('.workspace-path')).to_have_text('/one/project')
                assert page.locator(scroll_id).evaluate('(el) => el.scrollTop') == 0
                page.locator('#search').press('Escape')
                restored = page.locator(scroll_id).evaluate('(el) => el.scrollTop')
                assert abs(restored - before_search) <= 1, (width, height, theme, before_search, after_shortcut, restored)
                expect(page.locator('#search')).to_be_focused()
                # Footer stays reachable even in a 320x256 CSS viewport (400%-equivalent geometry).
                settings = page.locator('#open-settings')
                settings.scroll_into_view_if_needed()
                box = settings.bounding_box()
                assert box['y'] >= 0 and box['y'] + box['height'] <= height + 1
                settings.click()
                expect(page.locator('#settings')).to_be_visible()
                page.keyboard.press('Escape')
                page.keyboard.press('Control+k')
                page.locator('#search').fill('会话 49')
                expect(page.locator('.session-day')).to_have_count(0)
                expect(page.locator('#session-search-status')).to_contain_text('个匹配会话')
                page.locator('#search').press('Escape')
                page.locator('#sidebar').evaluate('(el) => el.scrollTop = 0')
                page.locator('#sessions').evaluate('(el) => el.scrollTop = 0')
                page.screenshot(path=str(OUT / f'layout-{width}-{height}-{theme}.png'))
                metrics.append({'width': width, 'height': height, 'touch': touch, 'theme': theme,
                    'historyHeight': page.locator('#sessions').bounding_box()['height'],
                    'footerHeight': page.locator('.sidebar-bottom').bounding_box()['height']})
            assert not errors, errors
            context.close()
        browser.close()
        (OUT / 'metrics.json').write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding='utf-8')
finally:
    process.terminate()
    try: process.wait(timeout=10)
    except subprocess.TimeoutExpired: process.kill(); process.wait(timeout=10)
    log.close()
print(f'PASS: full-width sidebar collapse/reopen, keyboard bypass, 0/1/50/500 sessions, duplicate workspace names, touch, short viewport, both themes; {OUT}')
