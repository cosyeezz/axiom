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
    # 一次全量挂载：300 条历史全部在场，没有分页控件也没有补齐请求。
    assert page.locator('#output .message').count() == 300, page.locator('#error').inner_text()
    page.evaluate("window.oldNode = document.querySelector('#output .message')")
    assert page.locator('#output').text_content().count('消息 0\n') >= 1
    assert page.locator('#output').text_content().count('消息 299') == 1
    # 本地跳转：回最早/回最新只改滚动位置，不销毁节点。
    page.click('#earliest')
    page.wait_for_timeout(400)
    assert page.eval_on_selector('#transcript', 'el => el.scrollTop < 200'), 'earliest must scroll to top'
    page.click('#latest')
    page.wait_for_timeout(400)
    assert page.eval_on_selector('#transcript', 'el => el.scrollTop > 1000'), 'latest must scroll to bottom'
    assert page.evaluate('oldNode.isConnected'), 'local jumps must not rebuild history nodes'
    assert page.locator('#output .message').count() == 300
    page.set_viewport_size({"width": 390, "height": 844})
    page.wait_for_timeout(200)
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert not errors, errors
    print('PASS: Chromium full-history mount, stable nodes, local jumps, mobile overflow, no page errors')
    browser.close()
