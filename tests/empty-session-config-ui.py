"""Run against empty-session-config-preview.mjs (real Sessions; port 4393)."""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
out = Path('artifacts/empty-session-config')
out.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto('http://127.0.0.1:4393')
    page.locator('.session-options > summary').first.click()
    page.locator('.session-configure').first.click()
    expect(page.locator('#config-new-session-title')).to_have_text('首次发送前可修改')
    select = page.locator('#create-capabilities select').first
    expect(select).to_be_enabled()
    select.select_option('custom')
    skills = page.locator('#create-capabilities fieldset').first.locator('input[type=checkbox]')
    page.locator('#create-capabilities fieldset').first.locator('summary').first.click()
    skills.nth(0).check()
    skills.nth(1).check()
    expect(skills.nth(0)).to_be_enabled()
    expect(skills.nth(1)).to_be_checked()
    page.locator('#apply-assembly').click()
    expect(page.locator('#create-feedback')).to_contain_text('已保存')
    expect(select).to_be_enabled()
    skills.nth(0).uncheck()
    page.locator('#apply-assembly').click()
    expect(page.locator('#create-feedback')).to_contain_text('已保存')
    expect(select).to_be_enabled()
    for theme in ['dark', 'light']:
        page.evaluate('(theme) => document.documentElement.dataset.theme = theme', theme)
        page.locator('#config-new-session-title').scroll_into_view_if_needed()
        page.screenshot(path=str(out / f'empty-{theme}.png'))
    page.set_viewport_size({'width': 390, 'height': 844})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path=str(out / 'empty-mobile.png'))
    assert not errors, errors
    browser.close()
print('Empty-session browser checks passed')
