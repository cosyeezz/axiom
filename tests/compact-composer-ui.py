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
                assert box['y'] + box['height'] <= action['y'], (width, box, action)
                assert box['width'] >= page.locator('#composer').bounding_box()['width'] - 2, (width, 'full-width input', box)
                toolbar_bottom = page.locator('#composer .actions').bounding_box()
                assert abs(toolbar_bottom['y'] + toolbar_bottom['height'] - page.locator('#composer').bounding_box()['y'] - page.locator('#composer').bounding_box()['height']) <= 2
                assert action['y'] + action['height'] <= 900
                assert page.locator('#composer-status').is_visible()
                assert page.locator('#session-runtime').is_visible()
                runtime = page.locator('#session-runtime')
                visible = runtime.inner_text()
                assert runtime.locator('.sr-only').count() == 2
                assert runtime.locator('.sr-only').first.evaluate("el => getComputedStyle(el).clip === 'rect(0px, 0px, 0px, 0px)'")
                assert runtime.locator('svg').count() == 2
                if width <= 700:
                    assert '5,000' not in visible and '128,000' not in visible
                    assert visible.strip() == '用量'
                    assert not runtime.locator('.runtime-cache').is_visible()
                    assert not runtime.locator('.runtime-context').is_visible()
                    assert runtime.bounding_box()['height'] == 44
                else:
                    assert '5,000 / 128,000 · 3.9%' in visible
                footer = page.locator('#composer-status').bounding_box()
                composer = page.locator('#composer').bounding_box()
                assert 0 <= footer['y'] - composer['y'] - composer['height'] <= 4
                assert footer['height'] <= (44 if width <= 700 else 56), (width, footer)
                assert '上下文 5,000 / 128,000' in runtime.get_attribute('aria-label')
                assert '≈ $0.023' in page.locator('#session-bill-total').inner_text()
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), width
                expect(page.locator('#composer-action-help')).not_to_be_visible()
                assert page.locator('#composer-help, .composer-help-trigger').count() == 0
                prompt.fill('检查发送按钮悬停')
                expect(primary).to_be_enabled()
                primary.hover()
                assert primary.evaluate('''el => {
                    const probe = document.createElement('span');
                    probe.style.backgroundColor = 'var(--accent-hover)'; el.append(probe);
                    const expected = getComputedStyle(probe).backgroundColor;
                    probe.remove();
                    return getComputedStyle(el).backgroundColor === expected;
                }'''), (theme, width, 'send hover must retain the primary accent, not a white-on-surface icon')
                page.mouse.move(0, 0)
                prompt.fill('长文本与换行\n' + '保留完整编辑能力，不遮挡按钮。' * 100)
                page.wait_for_timeout(60)
                assert 44 < prompt.bounding_box()['height'] <= 240
                assert prompt.bounding_box()['y'] + prompt.bounding_box()['height'] <= primary.bounding_box()['y']
                assert abs(primary.bounding_box()['y'] - action['y']) <= 1, (width, 'toolbar moved with text')
                prompt.evaluate('el => el.scrollTop = el.scrollHeight')
                assert abs(primary.bounding_box()['y'] - action['y']) <= 1
                prompt.fill('')
                if width <= 1000:
                    page.locator('.composer-tools-trigger').click()
                    assert page.locator('#context-menu').is_visible()
                    for selector in ['[data-context="skill"]', '[data-context="file"]', '[data-context="folder"]', '#add-image', '#compact-session', '#goal-enter', '.composer-session-info']:
                        assert page.locator(selector).is_visible(), selector
                        assert page.locator(selector).inner_text().strip(), selector
                    context_box = page.locator('#context-menu').bounding_box()
                    assert context_box and 0 <= context_box['y'] < 900, (width, 'context menu offscreen', context_box)
                    assert context_box['x'] >= 0 and context_box['x'] + context_box['width'] <= width
                    page.locator('[data-context="skill"]').click()
                    expect(page.locator('#context-search')).to_be_focused()
                    page.keyboard.press('Escape')
                    expect(page.locator('[data-context="skill"]')).to_be_focused()
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
        # Large auxiliary content scrolls independently: no viewport-fixed overlays or hidden actions.
        for width, height in [(1440, 600), (768, 560), (390, 480), (320, 360)]:
            page.set_viewport_size({'width': width, 'height': height})
            prompt.fill('多行草稿\n' * 40)
            page.evaluate('''() => {
                const dock = document.querySelector('#question-dock');
                dock.hidden = false;
                dock.innerHTML = '<p>' + '待回答问题与说明<br>'.repeat(80) + '</p><button type="button">确认</button>';
                const attachments = document.querySelector('#image-attachments');
                attachments.hidden = false;
                attachments.innerHTML = '<div><img alt="待发送图片" src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2288%22 height=%2272%22/%3E"></div>'.repeat(12);
                const completion = document.querySelector('#prompt-completion');
                completion.hidden = false;
                completion.innerHTML = '<div role="option">补全候选</div>'.repeat(20);
            }''')
            page.wait_for_timeout(80)
            for expanded in [False, True]:
                page.evaluate('(value) => document.querySelector(".shell").classList.toggle("mobile-expanded", value)', expanded)
                before = primary.bounding_box()
                prompt_box = prompt.bounding_box()
                assert prompt_box['y'] >= 0 and prompt_box['height'] >= 44, (width, height, prompt_box)
                assert before['y'] >= prompt_box['y'] + prompt_box['height'], (width, height, before)
                composer_box = page.locator('#composer').bounding_box()
                assert before['y'] + before['height'] <= min(height, composer_box['y'] + composer_box['height'] - 1), (width, height, before, composer_box)
                assert page.locator('#prompt-completion').bounding_box()['height'] >= 44
                assert page.locator('.composer-context').evaluate('el => el.scrollHeight > el.clientHeight')
                assert page.locator('#transcript').bounding_box()['height'] >= 48
                for scroll in [0, 100000]:
                    page.locator('.composer-context').evaluate('(el, value) => el.scrollTop = value', scroll)
                    prompt.evaluate('(el, value) => el.scrollTop = value', scroll)
                    after = primary.bounding_box()
                    assert abs(after['y'] - before['y']) < 1
                    assert primary.evaluate('el => { const r = el.getBoundingClientRect(); return [2, r.height / 2, r.height - 2].every(y => el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + y))); }')
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (width, height)
            page.screenshot(path=str(out / f'stress-{width}-{height}.png'))
            page.evaluate('''() => {
                for (const id of ['question-dock', 'image-attachments', 'prompt-completion']) {
                    const el = document.getElementById(id); el.hidden = true; el.replaceChildren();
                }
                document.querySelector('.shell').classList.remove('mobile-expanded');
            }''')
        page.set_viewport_size({'width': 320, 'height': 900})
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
    print('Compact composer Chromium checks passed (8 widths, 2 themes, menus, long text, billing, running, 4 short viewports with attachments/questions/completion)')
finally:
    server.terminate()
    server.wait(timeout=15)
