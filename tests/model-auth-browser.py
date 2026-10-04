"""Real Chromium + real WS auth bridge, mock identity provider only. No real login/model calls."""
import os
import re
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

with socket.socket() as sock:
    sock.bind(('127.0.0.1', 0))
    port = int(os.environ.get('PREVIEW_PORT', sock.getsockname()[1]))
out = Path(sys.argv[1] if len(sys.argv) > 1 else 'artifacts/model-auth')
out.mkdir(parents=True, exist_ok=True)
server = subprocess.Popen(['node', 'tests/model-selection-preview.mjs'], env={**os.environ, 'PREVIEW_PORT': str(port), 'PREVIEW_MODEL_AUTH': '1'}, stdout=subprocess.DEVNULL)
try:
    for _ in range(100):
        if server.poll() is not None:
            raise AssertionError('isolated preview exited; refusing unknown listener')
        try:
            urllib.request.urlopen(f'http://127.0.0.1:{port}', timeout=1)
            break
        except OSError:
            time.sleep(.1)
    else:
        raise AssertionError('preview did not start')
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={'width': 1440, 'height': 1000})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(f'http://127.0.0.1:{port}')
        page.locator('#open-settings').click()
        page.locator('#settings-models-tab').click()
        page.locator('.mm-nav-item').filter(has_text='OpenAI Codex').click()
        expect(page.locator('.mm-detail')).to_contain_text('OAuth 登录')
        assert '连接 Codex 订阅' not in page.locator('#models-panel').inner_text()
        assert '隐藏' not in page.locator('#models-panel').inner_text()
        for theme in ['dark', 'light']:
            page.evaluate('(theme) => document.documentElement.dataset.theme = theme', theme)
            for width in [1440, 768, 390, 320]:
                page.set_viewport_size({'width': width, 'height': 900})
                page.wait_for_timeout(100)
                assert page.locator('#models-panel').evaluate('el => el.scrollWidth <= el.clientWidth + 1'), (theme, width)
                assert page.locator('.mm-detail').evaluate('el => el.scrollWidth <= el.clientWidth + 1'), (theme, width)
                if width <= 700:
                    assert page.locator('.settings-nav').bounding_box()['height'] <= 90, (theme, width)
                    page.locator('#settings-models-tab').scroll_into_view_if_needed()
                page.get_by_role('button', name='OAuth 登录', exact=True).scroll_into_view_if_needed()
                page.screenshot(path=str(out / f'{theme}-{width}.png'))
        page.get_by_role('button', name='OAuth 登录', exact=True).click()
        dialog = page.locator('.mm-auth-dialog')
        expect(dialog.get_by_role('combobox')).to_be_focused()
        dialog.get_by_role('combobox').select_option('device')
        dialog.get_by_role('button', name='继续', exact=True).click()
        expect(dialog).to_contain_text('TEST-CODE')
        expect(dialog.get_by_role('link')).to_have_attribute('rel', 'noopener noreferrer')
        dialog.locator('input').fill('ok')
        dialog.get_by_role('button', name='继续', exact=True).click()
        expect(dialog).to_contain_text('连接尚未验证')
        dialog.get_by_role('button', name='关闭', exact=True).click()
        expect(dialog).not_to_be_visible()
        expect(page.locator('.mm-auth-section')).to_contain_text('凭据已配置')
        page.locator('.mm-nav-item').filter(has_text='OpenAI').filter(has_not_text='Codex').click()
        page.get_by_role('button', name='配置 API Key', exact=True).click()
        expect(dialog.locator('input')).to_have_attribute('type', 'password')
        page.keyboard.press('Escape')
        expect(dialog).not_to_be_visible()
        page.get_by_role('button', name='配置 API Key', exact=True).click()
        dialog.locator('input').fill('test-only-key')
        dialog.get_by_role('button', name='继续', exact=True).click()
        expect(dialog).to_contain_text('连接尚未验证')
        dialog.get_by_role('button', name='关闭', exact=True).click()
        assert 'test-only-key' not in page.locator('#models-panel').inner_text()
        page.locator('.mm-nav-item').filter(has_text='GitHub Copilot').click()
        page.get_by_role('button', name='OAuth 登录', exact=True).click()
        expect(dialog).to_contain_text('blank for github.com')
        dialog.get_by_role('button', name='继续', exact=True).click()
        expect(dialog).to_contain_text('TEST-CODE')
        dialog.locator('input').fill('ok')
        dialog.get_by_role('button', name='继续', exact=True).click()
        expect(dialog).to_contain_text('连接尚未验证')
        dialog.get_by_role('button', name='关闭', exact=True).click()
        page.get_by_role('button', name='自定义供应商', exact=True).click()
        form = page.locator('.mm-config-form')
        form.locator('input').fill('browser-native')
        form.locator('textarea').fill('{"api":"openai-completions","baseUrl":"http://localhost:9/v1","models":[{"id":"browser-model"}]}')
        form.get_by_role('button', name='保存配置', exact=True).click()
        expect(page.locator('.mm-alert')).to_contain_text('配置已保存')
        page.locator('.mm-advanced summary').click()
        expect(page.locator('.mm-config-form textarea')).to_have_value(re.compile('browser-model'))
        page.locator('.mm-limits summary').click()
        page.get_by_role('button', name='读取限额', exact=True).click()
        expect(page.locator('.mm-limits [role="status"]')).to_contain_text('已读取当前限额')
        page.get_by_label('供应商总并发', exact=True).fill('2')
        page.get_by_role('button', name='保存限额', exact=True).click()
        expect(page.locator('.mm-limits [role="status"]')).to_contain_text('限额已保存')
        page.get_by_role('button', name='读取限额', exact=True).click()
        expect(page.get_by_label('供应商总并发', exact=True)).to_have_value('2')
        for theme in ['dark', 'light']:
            page.evaluate('(theme) => document.documentElement.dataset.theme = theme', theme)
            for width in [1440, 320]:
                page.set_viewport_size({'width': width, 'height': 900})
                assert page.locator('.mm-detail').evaluate('el => el.scrollWidth <= el.clientWidth + 1'), (theme, width)
                page.locator('.mm-limits').scroll_into_view_if_needed()
                page.screenshot(path=str(out / f'advanced-{theme}-{width}.png'))
        assert not errors, errors
        browser.close()
    print('Model auth Chromium: 8 theme/viewport layouts, OAuth select/device/blank Copilot, API key, Escape, native JSON and limits checks passed')
finally:
    server.terminate()
    try:
        server.wait(timeout=10)
    except subprocess.TimeoutExpired:
        server.kill()
        server.wait(timeout=5)
