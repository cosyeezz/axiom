"""Real Chromium layout regression. Isolated fixture, no model calls or user data."""
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

port = int(os.environ.get('PREVIEW_PORT', '4357'))
out = Path(sys.argv[1] if len(sys.argv) > 1 else 'artifacts/compact-composer')
out.mkdir(parents=True, exist_ok=True)
server = subprocess.Popen(['node', 'tests/conversation-preview.mjs'], env={**os.environ, 'PREVIEW_PORT': str(port)}, stdout=subprocess.DEVNULL)
try:
    for _ in range(100):
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
        page.goto(f'http://127.0.0.1:{port}/#session=ui-billing')
        page.wait_for_function("() => document.querySelector('#session-runtime').textContent.includes('80.0%')")
        prompt = page.locator('#prompt')
        primary = page.locator('.composer-split button').first
        for theme in ['dark', 'light']:
            page.evaluate('(theme) => document.documentElement.dataset.theme = theme', theme)
            for width in [1440, 1024, 1000, 768, 700, 480, 390, 320]:
                page.set_viewport_size({'width': width, 'height': 900})
                prompt.fill('')
                page.wait_for_timeout(100)
                box = prompt.bounding_box()
                action = primary.bounding_box()
                assert box['height'] <= 45, (width, box)
                assert abs(box['y'] - action['y']) <= 4, (width, box, action)
                assert box['x'] + box['width'] <= action['x'], (width, 'overlap')
                assert box['width'] >= 120, (width, 'input too narrow', box)
                assert page.locator('#composer-status').is_visible()
                assert page.locator('#session-runtime').is_visible()
                assert '上下文 5,000 / 128,000' in page.locator('#session-runtime').inner_text()
                assert '≈ $0.023' in page.locator('#session-bill-total').inner_text()
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), width
                expect(page.locator('#composer-action-help')).not_to_be_visible()
                expect(page.locator('#composer-help')).not_to_be_visible()
                prompt.fill('长文本与换行\n' + '保留完整编辑能力，不遮挡按钮。' * 100)
                page.wait_for_timeout(60)
                assert 44 < prompt.bounding_box()['height'] <= 240
                assert abs(prompt.bounding_box()['y'] - primary.bounding_box()['y']) <= 4
                prompt.fill('')
                if width <= 1000:
                    page.locator('.composer-tools-trigger').click()
                    assert page.locator('#composer-tools').is_visible()
                    for selector in ['#add-context', '#add-image', '#compact-session', '#goal-enter', '.composer-session-info']:
                        assert page.locator(selector).is_visible(), selector
                    page.locator('#add-context').click()
                    context_box = page.locator('#context-menu').bounding_box()
                    assert context_box and 0 <= context_box['y'] < 900, (width, 'context menu offscreen', context_box)
                    assert context_box['x'] >= 0 and context_box['x'] + context_box['width'] <= width
                    page.locator('[data-context="skill"]').click()
                    expect(page.locator('#context-search')).to_be_focused()
                    page.keyboard.press('Escape')
                    expect(page.locator('[data-context="skill"]')).to_be_focused()
                    page.keyboard.press('Escape')
                    expect(page.locator('#add-context')).to_be_focused()
                    page.keyboard.press('Escape')
                    expect(page.locator('.composer-tools-trigger')).to_be_focused()
                    page.locator('.composer-tools-trigger').click()
                    page.locator('.composer-session-info').click()
                    assert page.locator('#session-detail').is_visible()
                    page.locator('#session-detail-close').click()
                page.locator('#session-billing-trigger').click()
                assert page.locator('#session-billing').get_attribute('open') is not None
                page.locator('#session-detail-close').click()
                page.screenshot(path=str(out / f'{theme}-{width}.png'))
        # Enter after explicit newline remains the existing send path; test Shift+Enter editing.
        prompt.fill('第一行')
        prompt.press('Shift+Enter')
        prompt.type('第二行')
        assert prompt.input_value() == '第一行\n第二行'
        # Running controls remain at the same edge, force still requires confirmation.
        page.goto(f'http://127.0.0.1:{port}/#session=ui-tools')
        page.reload()
        page.wait_for_function("() => document.querySelector('.composer-split button')?.textContent === 'stop'")
        assert primary.get_attribute('aria-label') == '等待安全点后停止'
        page.locator('.composer-split button').last.click()
        expect(page.locator('[data-operation="stop"]')).to_be_focused()
        assert not page.locator('#ax-tooltip').is_visible(), 'pointer-opened menu must not show focus tooltip'
        page.locator('[data-operation="force"]').click()
        assert page.locator('#force-stop-dialog').is_visible()
        page.locator('#force-stop-cancel').click()
        page.screenshot(path=str(out / 'running-320.png'))
        assert not errors, errors
        browser.close()
    print('Compact composer Chromium checks passed (8 widths, 2 themes, menus, long text, billing, running)')
finally:
    server.terminate()
    server.wait(timeout=15)
