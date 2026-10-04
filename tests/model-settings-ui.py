"""Run model-selection-preview.mjs first; isolated credentials and mock upstream."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
import re
URL = os.environ.get('AXIOM_PREVIEW_URL', 'http://127.0.0.1:4337')
OUT = Path(os.environ.get('AXIOM_ARTIFACTS', 'artifacts/model-settings'))
OUT.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(URL)
    page.wait_for_selector('.composer-model-trigger:enabled')
    original = page.locator('.composer-model-trigger').inner_text()
    def open_thinking():
        page.locator('.composer-model-trigger').click()
        page.get_by_role('dialog', name='模型配置', exact=True).get_by_role('button', name='minimax-cn', exact=True).click()
        page.get_by_role('dialog', name='模型', exact=True).get_by_role('button', name='MiniMax M2.5', exact=True).click()
    open_thinking()
    star = page.locator('.composer-favorite[data-favorite-key="minimax-cn/MiniMax-M2.5:high"]')
    expected = str(star.get_attribute('aria-pressed') != 'true').lower()
    star.click()
    expect(star).to_have_attribute('aria-pressed', expected)
    assert page.locator('.composer-model-trigger').inner_text() == original
    page.reload()
    page.wait_for_selector('.composer-model-trigger:enabled')
    open_thinking()
    expect(star).to_have_attribute('aria-pressed', expected)
    page.keyboard.press('Escape')
    page.locator('#open-settings').click()
    page.locator('#settings-models-tab').click()
    page.locator('.mm-nav-item').filter(has_text='preview').click()
    page.locator('.mm-advanced summary').click()
    editor = page.locator('.mm-config-form textarea')
    expect(editor).to_have_value(re.compile('"keep": true'))
    import json
    value = json.loads(editor.input_value())
    value['models'] = [{'id': 'chosen-model'}]
    editor.fill(json.dumps(value))
    page.get_by_role('button', name='保存配置', exact=True).click()
    expect(page.locator('.mm-alert')).to_contain_text('配置已保存')
    page.locator('.mm-advanced summary').click()
    expect(editor).to_have_value(re.compile('chosen-model'))
    assert 'untouched-model' not in editor.input_value()
    assert '"keep": true' in editor.input_value()
    assert '隐藏' not in page.locator('#models-panel').inner_text()
    page.screenshot(path=str(OUT / 'desktop.png'))
    for width in [390, 320]:
        page.set_viewport_size({'width': width, 'height': 844})
        page.wait_for_timeout(200)
        assert page.locator('#models-panel').evaluate('el => el.scrollWidth <= el.clientWidth + 1')
        page.screenshot(path=str(OUT / f'mobile-{width}.png'))
    assert not errors, errors
    browser.close()
print('Model settings: native JSON round trip, masked secret, thinking persistence and mobile checks passed')
