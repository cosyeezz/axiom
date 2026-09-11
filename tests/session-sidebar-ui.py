"""Run against node tests/conversation-preview.mjs (port 4321)."""
import os
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1440, "height": 960})
    def expose(route):
        response = route.fetch()
        route.fulfill(response=response, body=response.text() + '\nwindow.sidebarFixture = (fn) => { allSessions = fn(allSessions); hiddenSessions = new Set(["done", "run"]); renderSessions(); };')
    page.route('**/app.js', expose)
    page.goto(os.environ.get("AXIOM_PREVIEW_URL", "http://127.0.0.1:4321"))
    page.wait_for_selector(".session-row")
    page.evaluate("""() => window.sidebarFixture((sessions) => {
      const base = sessions[0];
      return [
        {...base, id:'new', title:'新会话', status:'idle', createdAt:new Date(2026,8,11,12).getTime()},
        {...base, id:'old', title:'旧会话', status:'idle', createdAt:new Date(2026,8,10,12).getTime(), updatedAt:Date.now()},
        {...base, id:'done', title:'已完成会话', status:'idle', createdAt:new Date(2026,8,9,12).getTime()},
        {...base, id:'run', title:'运行会话', status:'running', createdAt:new Date(2026,8,8,12).getTime()},
        {...base, id:'foreign', title:'其他工作空间', cwd:'/other', status:'running'}
      ];
    })""")
    assert page.locator('.session-group').all_text_contents() == ['执行中', '待继续', '已完成']
    assert page.locator('.session-item span').all_text_contents() == ['运行会话', '新会话', '旧会话', '已完成会话']
    assert page.locator('.session-day').all_text_contents() == ['2026-09-08', '2026-09-11', '2026-09-10', '2026-09-09']
    assert page.locator('.session-row[draggable="true"]').count() == 0
    dot = page.locator('[data-session-id="run"] .session-running-dot')
    assert dot.is_visible()
    assert dot.evaluate('(el) => getComputedStyle(el).backgroundColor') == 'rgb(39, 166, 68)'
    assert not page.locator('[data-session-id="new"] .session-running-dot').is_visible()
    for width in [1440, 320]:
        page.set_viewport_size({"width": width, "height": 960})
        page.wait_for_timeout(150)
        if page.locator('#toggle-sidebar').get_attribute('aria-expanded') != 'true':
            page.locator('#toggle-sidebar').click()
        row = page.locator('[data-session-id="new"]')
        assert not row.locator('.session-rename').is_visible()
        row.locator('.session-more').click(timeout=2000)
        assert row.locator('.session-rename').is_visible()
        assert row.locator('.session-delete').is_visible()
        box = row.locator('.session-delete').bounding_box()
        side = page.locator('#sidebar').bounding_box()
        assert box['x'] >= side['x'] and box['x'] + box['width'] <= side['x'] + side['width']
        page.keyboard.press('Escape')
        assert not row.locator('.session-delete').is_visible()
        assert row.locator('.session-more').evaluate('(el) => el === document.activeElement')
        row.locator('.session-more').focus()
        page.keyboard.press('Enter')
        assert row.locator('.session-rename').is_visible()
        page.locator('.session-group').first.click()
        assert not row.locator('.session-delete').is_visible()
    browser.close()
print('PASS: workspace filter, fixed groups/dates/order, desktop/mobile action disclosure and keyboard dismissal')
