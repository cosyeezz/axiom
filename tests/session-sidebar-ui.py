"""Run against node tests/conversation-preview.mjs (port 4321)."""
import os
import tempfile
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1440, "height": 960})
    def expose(route):
        response = route.fetch()
        route.fulfill(response=response, body=response.text() + '\nwindow.sidebarFixture = (fn) => { allSessions = fn(allSessions); hiddenSessions = new Set(["done", "run", ...Array.from({length: 40}, (_, i) => `done-${i}`)]); seenSessions = { attention: 1, old: new Date(2027, 1, 1).getTime(), new: new Date(2027, 1, 1).getTime(), done: new Date(2027, 1, 1).getTime() }; renderSessions(); };')
    page.route('**/app.js', expose)
    page.goto(os.environ.get("AXIOM_PREVIEW_URL", "http://127.0.0.1:4321"))
    page.wait_for_selector(".session-row")
    page.evaluate("""() => window.sidebarFixture((sessions) => {
      const base = sessions[0];
      // updatedAt 同时决定排序和日期分线；attention 的 seen 记在 updatedAt 之前 → 待查看。
      const at = (day) => new Date(2026, 8, day, 12).getTime();
      return [
        {...base, id:'run', title:'运行会话', status:'running', updatedAt:at(11)},
        {...base, id:'attention', title:'待查看会话', status:'idle', updatedAt:at(10)},
        {...base, id:'old', title:'旧会话', status:'idle', updatedAt:at(9)},
        {...base, id:'new', title:'新会话', status:'idle', updatedAt:at(8)},
        {...base, id:'done', title:'已完成会话', status:'idle', updatedAt:at(7)},
        {...base, id:'foreign', title:'其他工作空间', cwd:'/other', status:'running', updatedAt:at(12)}
      ];
    })""")
    # ── 工作空间分组 ──
    assert page.locator('.workspace-group').count() == 2
    headers = page.locator('.workspace-name').all_text_contents()
    assert len(headers) == 2
    assert headers[1] == 'other'
    assert '/other' in page.locator('.workspace-header').nth(1).get_attribute('title')
    # 当前工作空间展开，/other 默认折叠
    assert page.locator('.workspace-group').first.evaluate('(el) => el.open')
    assert not page.locator('.workspace-group').nth(1).evaluate('(el) => el.open')
    # /other 显示运行中徽章
    badges = page.locator('.ws-badge-running').all_text_contents()
    assert any('◉' in b and '1' in b for b in badges)
    # ── 当前工作空间内部列表 ──
    cur = page.locator('.workspace-group').first
    assert cur.locator('.session-group').all_text_contents() == ['进行中', '已完成']
    assert cur.locator('.session-item span').all_text_contents() == ['运行会话', '待查看会话', '旧会话', '新会话', '已完成会话']
    assert cur.locator('.session-day').all_text_contents() == ['2026-09-11', '2026-09-10', '2026-09-09', '2026-09-08', '2026-09-07']
    assert not cur.locator('.session-completed').evaluate('(el) => el.open')
    assert not cur.locator('[data-session-id="done"]').is_visible()
    # 已完成段紧挨在设置按钮上方
    completed = cur.locator('.session-completed').bounding_box()
    settings = page.locator('#open-settings').bounding_box()
    assert 0 <= settings['y'] - completed['y'] - completed['height'] <= 40  # workspace header padding
    cur.locator('.session-completed > summary').click()
    assert cur.locator('[data-session-id="done"]').is_visible()
    page.evaluate('window.sidebarFixture((sessions) => sessions)')
    assert cur.locator('.session-completed').evaluate('(el) => el.open')
    cur.locator('.session-completed > summary').click()
    assert page.locator('.session-row[draggable="true"]').count() == 0
    # ── 状态点 ──
    dot = page.locator('[data-session-id="run"] .session-running-dot')
    assert dot.is_visible()
    assert dot.evaluate('(el) => getComputedStyle(el).backgroundColor') == 'rgb(39, 166, 68)'
    seen = page.locator('[data-session-id="attention"] .session-attention-dot')
    assert seen.is_visible()
    assert seen.get_attribute('aria-label') == '有待查看的结果'
    assert seen.evaluate('(el) => getComputedStyle(el).backgroundColor') == 'rgb(130, 143, 255)'
    assert not page.locator('[data-session-id="old"] .session-running-dot').is_visible()
    assert not page.locator('[data-session-id="old"] .session-attention-dot').is_visible()
    # ── 展开 /other 工作区 ──
    page.locator('.workspace-header').nth(1).click()
    assert page.locator('.workspace-group').nth(1).evaluate('(el) => el.open')
    assert page.locator('[data-session-id="foreign"]').is_visible()
    assert page.locator('[data-session-id="foreign"] .session-running-dot').is_visible()
    other = page.locator('.workspace-group').nth(1)
    assert other.locator('.session-group').all_text_contents() == ['进行中']
    assert other.locator('.session-item span').all_text_contents() == ['其他工作空间']
    # ── 操作菜单（桌面 / 移动端） ──
    for width in [1440, 320]:
        page.set_viewport_size({"width": width, "height": 960})
        page.wait_for_timeout(150)
        if page.locator('#toggle-sidebar').get_attribute('aria-expanded') != 'true':
            page.locator('#toggle-sidebar').click()
        row = page.locator('[data-session-id="new"]')
        assert not row.locator('.session-rename').is_visible()
        before = page.locator('[data-session-id="old"]').bounding_box()
        row.locator('.session-more').click(timeout=2000)
        page.wait_for_timeout(100)
        assert row.locator('.session-rename').is_visible()
        assert page.locator('[data-session-id="old"]').bounding_box()['y'] == before['y'], 'menu must not push the next title down'
        assert row.locator('.session-delete').is_visible()
        box = row.locator('.session-delete').bounding_box()
        assert box['x'] >= 0 and box['x'] + box['width'] <= width
        if width == 1440:
            trigger = row.locator('.session-more').bounding_box()
            assert box['x'] >= trigger['x'] + trigger['width'], 'menu opens to the right of its own dots'
        row.locator('.session-copy').click()
        assert row.locator('[data-copy="directory"]').is_visible()
        submenu = row.locator('.session-copy-menu').bounding_box()
        parent = row.locator('.session-actions').first.bounding_box()
        assert submenu['x'] >= 0 and submenu['x'] + submenu['width'] <= width
        if width == 1440:
            assert submenu['x'] >= parent['x'] + parent['width'] - 8
        page.keyboard.press('Escape')
        assert not row.locator('[data-copy="directory"]').is_visible()
        assert row.locator('.session-delete').is_visible()
        assert row.locator('.session-copy').evaluate('(el) => el === document.activeElement')
        page.keyboard.press('Escape')
        assert not row.locator('.session-delete').is_visible()
        assert row.locator('.session-more').evaluate('(el) => el === document.activeElement')
        row.locator('.session-more').focus()
        page.keyboard.press('Enter')
        page.wait_for_timeout(100)
        assert row.locator('.session-rename').is_visible()
        row.locator('.session-copy').focus()
        page.keyboard.press('Enter')
        page.keyboard.press('Tab')
        assert row.locator('[data-copy="directory"]').evaluate('(el) => el === document.activeElement')
        page.locator('.session-group').first.click()
        assert not row.locator('.session-delete').is_visible()
        assert not row.locator('[data-copy="directory"]').is_visible()
    # ── 大量会话布局约束 ──
    page.evaluate('''() => window.sidebarFixture((sessions) => [
      ...sessions,
      ...Array.from({length: 40}, (_, i) => ({...sessions[0], id: `active-${i}`})),
      ...Array.from({length: 40}, (_, i) => ({...sessions[0], id: `done-${i}`}))
    ])''')
    cur = page.locator('.workspace-group').first
    cur.locator('.session-completed > summary').click()
    settings = page.locator('#open-settings').bounding_box()
    completed = cur.locator('.session-completed').bounding_box()
    assert settings['y'] + settings['height'] <= 960
    assert completed['y'] + completed['height'] <= settings['y']
    assert cur.locator('.session-section').first.evaluate('(el) => el.scrollHeight > el.clientHeight')
    assert cur.locator('.session-completed').evaluate('''(el) => {
      el.scrollTop = 10000;
      return el.scrollTop > 0 || getComputedStyle(el, '::details-content').overflowY === 'auto';
    }''')
    page.screenshot(path=os.environ.get('AXIOM_SIDEBAR_SCREENSHOT', os.path.join(tempfile.gettempdir(), 'axiom-session-sidebar.png')))
    browser.close()
print('PASS: workspace groups, collapse/expand, running/attention/idle order, dots, dates, desktop/mobile action disclosure and keyboard dismissal')