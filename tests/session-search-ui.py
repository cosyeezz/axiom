"""Session title search UX against conversation-preview.mjs; no model/user data."""
import os
import json
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

URL = os.environ.get('AXIOM_PREVIEW_URL', 'http://127.0.0.1:4321')
OUT = Path(os.environ.get('AXIOM_SEARCH_ARTIFACTS', os.path.join(tempfile.gettempdir(), 'axiom-session-search')))
OUT.mkdir(parents=True, exist_ok=True)
LONG = '修复会话标题搜索：跨工作空间、已完成分组与键盘焦点回归 ' * 5

with sync_playwright() as p:
    browser = p.chromium.launch()
    for touch, width, height in [(False, 1440, 960), (False, 768, 960), (False, 320, 960), (True, 390, 960), (True, 320, 960), (True, 667, 375)]:
        context = browser.new_context(viewport={'width': width, 'height': height}, has_touch=touch, is_mobile=touch)
        page = context.new_page()
        errors = []
        sent = []
        page.on('websocket', lambda ws: ws.on('framesent', lambda data: sent.append(json.loads(data))))
        page.on('pageerror', lambda error: errors.append(str(error)))
        def expose(route):
            response = route.fetch()
            route.fulfill(response=response, body=response.text() + '''
window.searchFixture = (title) => {
  const base = allSessions[0];
  allSessions = [
    {...base, id: sessionId, title: '当前会话', status: 'idle'},
    {...base, id: 'long-title', title, status: 'idle'},
    {...base, id: 'literal', title: '<img src=x onerror=alert(1)> [A+B] 安全标题', status: 'idle'},
    {...base, id: 'unicode', title: 'İabc', status: 'idle'},
    {...base, id: 'done-match', title: '已完成的标题搜索回归', status: 'idle', cwd: '/other'},
    {...base, id: 'foreign', title: '远端标题搜索回归', status: 'idle', cwd: '/other'}
  ];
  hiddenSessions = new Set(['done-match']);
  renderSessions();
};
window.redrawSearchFixture = () => renderSessions();
''')
        page.route('**/app.js', expose)
        page.goto(URL)
        page.wait_for_selector('.session-row', state='attached')
        page.evaluate('(title) => window.searchFixture(title)', LONG)
        page.keyboard.press('Control+k')
        expect(page.locator('#search')).to_be_focused()
        assert page.locator('#toggle-sidebar').get_attribute('aria-expanded') == 'true'
        other = page.locator('.workspace-group[data-cwd="/other"]')
        assert not other.evaluate('(el) => el.open')
        assert not other.locator('.session-completed').evaluate('(el) => el.open')
        page.wait_for_timeout(100)  # settle native toggle events before comparing preferences
        prefs = page.evaluate('() => [localStorage.getItem("axiom.openCwds"), localStorage.getItem("axiom.sessionGroups")]')
        page.locator('#search').fill('标题搜索')
        expect(page.locator('#session-search-status')).to_have_text('3 个匹配会话 · 2 个工作空间')
        expect(page.locator('[data-session-id="done-match"]')).to_be_visible()
        expect(page.locator('[data-session-id="foreign"]')).to_be_visible()
        assert page.locator('.session-row-title mark').count() == 7
        page.wait_for_timeout(100)
        assert page.evaluate('() => [localStorage.getItem("axiom.openCwds"), localStorage.getItem("axiom.sessionGroups")]') == prefs
        page.locator('#search').press('ArrowDown')
        button = page.locator('[data-session-id="long-title"] .session-item')
        expect(button).to_be_focused()
        assert button.get_attribute('aria-current') == 'false'
        assert button.evaluate('(el) => getComputedStyle(el).outlineStyle') == 'solid'
        page.evaluate('window.redrawSearchFixture()')
        expect(button).to_be_focused()
        page.keyboard.press('End')
        expect(page.locator('[data-session-id="done-match"] .session-item')).to_be_focused()
        page.keyboard.press('Escape')
        expect(page.locator('#search')).to_have_value('')
        assert not other.evaluate('(el) => el.open')
        assert not other.locator('.session-completed').evaluate('(el) => el.open')
        # Literal matching/highlighting never parses markup or regex.
        page.locator('#search').fill('[a+b]')
        expect(page.locator('.session-row-title mark')).to_have_text('[A+B]')
        assert page.locator('.session-row-title img').count() == 0
        page.locator('#search').fill('abc')
        expect(page.locator('.session-row-title mark')).to_have_text('abc')
        page.locator('#search').fill('no such title')
        expect(page.locator('#session-search-status')).to_have_text('0 个匹配会话 · 0 个工作空间')
        page.locator('.session-search-reset').click()
        expect(page.locator('#search')).to_be_focused()
        # Two-line clamp is real layout, not only a CSS/source assertion.
        title = button.locator('.session-row-title')
        size = title.bounding_box()
        assert 40 <= size['height'] <= 43, size
        more = page.locator('[data-session-id="long-title"] .session-more')
        if touch:
            assert more.evaluate('(el) => getComputedStyle(el).opacity') == '1'
            assert more.bounding_box()['height'] >= 44
            assert more.bounding_box()['x'] >= size['x'] + size['width']
            more.tap()
        else:
            button.focus()
            expect(page.locator('#ax-tooltip')).to_have_text(LONG)
            assert more.evaluate('(el) => getComputedStyle(el).opacity') == '1'
            more.click()
        menu = page.locator('[data-session-id="long-title"] .session-actions').first
        expect(menu).to_be_visible()
        expect(menu.locator('.session-menu-title')).to_have_text(LONG)
        box = menu.bounding_box()
        assert box['x'] >= 0 and box['x'] + box['width'] <= width
        assert box['y'] >= 0 and box['y'] + box['height'] <= height
        # Menu title is visually before actions even though appended after their stable DOM order.
        assert menu.locator('.session-menu-title').bounding_box()['y'] < menu.locator('.session-pin').bounding_box()['y']
        page.screenshot(path=str(OUT / f'{width}-{touch}-menu.png'))
        if height < 500:
            menu.locator('.session-delete').scroll_into_view_if_needed()
            delete_box = menu.locator('.session-delete').bounding_box()
            assert 0 <= delete_box['y'] and delete_box['y'] + delete_box['height'] <= height
        page.keyboard.press('Escape')
        expect(more).to_be_focused()
        page.locator('#search').fill('标题搜索')
        page.screenshot(path=str(OUT / f'{width}-{touch}-search-dark.png'))
        page.evaluate('document.documentElement.dataset.theme = "light"')
        page.screenshot(path=str(OUT / f'{width}-{touch}-search-light.png'))
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        # Enter opens a real preview session; arrow focus alone above never changed selection.
        page.locator('#search').fill('当前会话')
        before_attach = len([frame for frame in sent if frame.get('type') == 'session.attach'])
        page.locator('#search').press('Enter')
        page.wait_for_timeout(150)
        assert len([frame for frame in sent if frame.get('type') == 'session.attach']) == before_attach + 1
        if width <= 700:
            assert page.locator('#toggle-sidebar').get_attribute('aria-expanded') == 'false'
        # Confirm search mode never persists its auto-expanded sections across a reload.
        page.reload()
        page.wait_for_selector('.session-row', state='attached')
        page.evaluate('(title) => window.searchFixture(title)', LONG)
        page.keyboard.press('Control+k')
        assert not page.locator('.workspace-group[data-cwd="/other"]').evaluate('(el) => el.open')
        assert not page.locator('.workspace-group[data-cwd="/other"] .session-completed').evaluate('(el) => el.open')
        assert not errors, errors
        context.close()
    browser.close()
print(f'PASS: title search, folding isolation/reload, literal/Unicode highlight, focus/Enter, long titles, touch menus, dark/light at 1440/768/390/320px and 667x375 landscape; artifacts: {OUT}')
