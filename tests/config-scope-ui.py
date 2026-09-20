"""Run against conversation-preview.mjs (PREVIEW_PORT=4391). Real Chromium screenshots."""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

out = Path('artifacts/config-scope')
out.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto('http://127.0.0.1:4391')
    page.locator('.workspace-config-btn').first.wait_for()
    header = page.locator('.workspace-header').first
    config_button = header.locator('.workspace-config-btn')
    new_button = header.locator('.workspace-new-btn')
    visual = '(el) => { const s = getComputedStyle(el); return [s.width, s.height, s.borderWidth, s.borderRadius, s.backgroundColor, s.opacity]; }'
    for theme in ['light', 'dark']:
        page.evaluate('(theme) => document.documentElement.dataset.theme = theme', theme)
        page.mouse.move(1400, 950)
        assert config_button.evaluate(visual) == new_button.evaluate(visual)
        header.hover()
        assert config_button.evaluate(visual) == new_button.evaluate(visual)
        config_button.hover()
        config_hover = config_button.evaluate(visual)
        header.screenshot(path=str(out / f'workspace-actions-{theme}-config.png'))
        new_button.hover()
        assert config_hover == new_button.evaluate(visual)
        header.screenshot(path=str(out / f'workspace-actions-{theme}-new.png'))
    page.screenshot(path=str(out / 'sidebar.png'))
    assert page.locator('#open-workspace-config, #open-session-config, #session-config-menu').count() == 0
    page.locator('.workspace-config-btn').first.click()
    page.locator('#create-main-model').wait_for(state='attached')
    assert page.locator('#settings-title').inner_text() == '工作空间配置'
    assert not page.locator('.settings-nav').is_visible()
    expect(page.locator('#config-subagent-title')).to_have_text('子代理默认值 · 新会话采用')
    page.screenshot(path=str(out / 'workspace.png'))
    page.locator('#settings button[aria-label="关闭设置"]').click()
    page.locator('.session-options > summary').first.click()
    page.locator('.session-configure').first.click()
    page.locator('#create-main-model').wait_for(state='attached')
    expect(page.locator('#settings-title')).to_have_text('当前会话配置')
    assert not page.locator('.settings-nav').is_visible()
    expect(page.locator('#config-subagent-title')).to_have_text('子代理设置 · 下次委派生效')
    assert page.evaluate('Boolean(document.querySelector("#create-subagent-settings").compareDocumentPosition(document.querySelector("#config-new-session-title")) & Node.DOCUMENT_POSITION_FOLLOWING)')
    page.screenshot(path=str(out / 'session.png'))
    page.set_viewport_size({"width": 390, "height": 844})
    page.screenshot(path=str(out / 'session-mobile.png'))
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.locator('#settings button[aria-label="关闭设置"]').click()
    page.set_viewport_size({"width": 1440, "height": 1000})
    page.locator('#open-settings').click()
    assert page.locator('.settings-nav').is_visible()
    assert page.locator('#settings-title').inner_text() == '设置'
    page.screenshot(path=str(out / 'global.png'))
    assert not errors, errors
    browser.close()
print('Browser checks passed; screenshots:', out)
