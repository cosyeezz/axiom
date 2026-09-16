"""Run with node tests/continuous-preview.mjs; isolated Chromium layout regression."""
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto('http://127.0.0.1:4398')
    page.wait_for_selector('#workspace:not([hidden])')
    page.wait_for_timeout(600)
    assert not page.locator('#history-pages').is_visible()
    assert page.locator('#output .message').count() == 60
    page.evaluate("window.oldNode = document.querySelector('#output .message')")
    page.eval_on_selector('#transcript', 'el => el.scrollTop = 200')
    page.wait_for_timeout(1500)
    assert page.locator('#output .message').count() >= 120, page.locator('#error').inner_text()
    page.wait_for_timeout(500)
    assert page.evaluate('oldNode.isConnected')
    assert page.eval_on_selector('#transcript', 'el => el.scrollTop > 1000'), 'prepend must compensate reading anchor'
    assert page.locator('#output').text_content().count('消息 299') == 1
    page.set_viewport_size({"width": 390, "height": 844})
    page.wait_for_timeout(200)
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert not errors, errors
    print('PASS: Chromium continuous prepend, stable nodes/scroll anchor, mobile overflow, no page errors')
    browser.close()
