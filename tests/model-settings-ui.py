"""Run model-selection-preview.mjs first; isolated credentials and mock upstream."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
URL = os.environ.get('AXIOM_PREVIEW_URL', 'http://127.0.0.1:4337')
OUT = Path('artifacts/model-settings')
OUT.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(URL)
    page.wait_for_selector('#thinking:enabled')
    original = page.locator('#thinking').input_value()
    page.locator('#thinking').click()
    star = page.locator('.ax-mp-menu:visible .ax-mp-star[data-value="high"]')
    expected = str(star.get_attribute('aria-checked') != 'true').lower()
    star.click()
    page.wait_for_timeout(250)
    assert page.locator('#thinking').input_value() == original
    page.reload()
    page.wait_for_selector('#thinking:enabled')
    page.locator('#thinking').click()
    assert star.get_attribute('aria-checked') == expected
    page.keyboard.press('Escape')
    page.locator('#open-settings').click()
    page.locator('#settings-models-tab').click()
    page.get_by_role('button', name='拉取模型列表…', exact=True).click()
    page.get_by_role('checkbox', name='选择模型 chosen-model', exact=True).check()
    page.get_by_role('button', name='添加选中的模型（1）', exact=True).click()
    page.get_by_role('checkbox', name='已添加 chosen-model', exact=True).wait_for()
    assert page.get_by_role('checkbox', name='已添加 chosen-model', exact=True).is_disabled()
    assert not page.get_by_role('checkbox', name='选择模型 untouched-model', exact=True).is_checked()
    page.screenshot(path=str(OUT / 'desktop.png'))
    for width in [390, 320]:
        page.set_viewport_size({'width': width, 'height': 844})
        page.wait_for_timeout(200)
        assert page.locator('#models-panel').evaluate('el => el.scrollWidth <= el.clientWidth + 1')
        page.screenshot(path=str(OUT / f'mobile-{width}.png'))
    assert not errors, errors
    browser.close()
print('Model settings: discovery, selected-only save, thinking persistence and mobile checks passed')
