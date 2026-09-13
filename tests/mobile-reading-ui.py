"""Run PREVIEW_PORT=4342 node tests/conversation-preview.mjs, then this script.
Uses installed Python Playwright; no model calls or user data.
"""
import os
import subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright

# 折叠（纯阅读）状态下必须不可见：顶栏、输入、所有 composer 辅助（含队列/图片/压缩进度/上下文条/底部帮助）、earliest/latest。
COLLAPSED_HIDDEN = ['main > header', '#prompt', '#composer .selectors', '.composer-footer', '#session-runtime',
                    '#earliest', '#latest', '.context-bar', '#message-queue', '#task-runs', '#compaction-progress']

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 390, "height": 844}, has_touch=True)
    errors = []
    page.on("pageerror", lambda e: (errors.append(str(e)), print('PAGE ERROR', str(e))))
    url = os.environ.get("PREVIEW_URL", "http://127.0.0.1:4342")
    temp = os.environ.get('TEMP', '/tmp')
    page.goto(url)
    page.wait_for_selector("#workspace:not([hidden])")
    page.wait_for_timeout(200)
    page.evaluate('localStorage.setItem("axiom.session", "ui-review")')
    page.reload()
    page.wait_for_selector("#workspace:not([hidden])")
    page.wait_for_timeout(200)
    prompt = page.locator("#prompt")
    # 折叠：先取消 preview 默认的 hidden，验证是 CSS 折叠规则在隐藏，而不是数据缺失。
    page.evaluate("for (const id of ['earliest', 'latest', 'message-queue', 'task-runs', 'compaction-progress']) document.getElementById(id).hidden = false")
    still = [sel for sel in COLLAPSED_HIDDEN if page.locator(sel).first.is_visible()]
    assert not still, still
    controls = page.locator(".mobile-controls")
    assert controls.is_visible()
    expand = page.locator("#mobile-expand")
    assert expand.text_content() == "展开" and expand.get_attribute("aria-expanded") == "false"
    status = page.locator("#mobile-runtime")
    text = status.text_content()
    # 底部一行状态：双百分比 · 供应商 · 模型 · 思考，单行不换行。
    assert status.is_visible() and "axiom" in text and text.count("·") >= 3, text
    assert status.evaluate("el => el.clientHeight") <= 20, text
    page.screenshot(path=os.path.join(temp, 'axiom-mobile-collapsed.png'))
    # 展开：输入（14px）、模型选择、顶栏、辅助行全部可见，底部状态仍在。
    expand.click()
    assert expand.text_content() == "收起" and expand.get_attribute("aria-expanded") == "true"
    shown = [sel for sel in ['main > header', '#prompt', '#composer .selectors', '.context-bar'] if not page.locator(sel).first.is_visible()]
    assert not shown, shown
    assert prompt.evaluate("el => getComputedStyle(el).fontSize") == "14px"
    assert status.is_visible()
    page.screenshot(path=os.path.join(temp, 'axiom-mobile-expanded.png'))
    expand.click()
    assert prompt.is_hidden()  # 再点收起，回到纯阅读
    expand.click()
    for width, height in [(390, 844), (320, 568), (390, 420), (667, 375)]:
        page.set_viewport_size({"width": width, "height": height})
        page.wait_for_timeout(100)
        prompt.fill("")
        assert prompt.bounding_box()["height"] == 44, (width, prompt.bounding_box())
        prompt.fill("长草稿\n" * 60)
        assert prompt.bounding_box()["height"] <= min(120, height * .2) + 1
        page.locator("#output details").evaluate_all("els => els.forEach(el => el.open = true)")
        # Stress simultaneous task/queue/status rows without sending anything.
        page.evaluate('''() => {
            for (const id of ['task-runs', 'message-queue']) {
                const el = document.getElementById(id); el.hidden = false;
                el.replaceChildren(...Array.from({length: 8}, () => {
                    const b = document.createElement('button'); b.textContent = '任务或排队消息'; return b;
                }));
            }
            const runtime = document.getElementById('session-runtime');
            runtime.innerHTML = '<span>上下文 128000 tokens</span><span>缓存命中 99%</span><span>模型运行信息</span>';
        }''')
        checks = page.evaluate('''() => {
            const $ = id => document.getElementById(id);
            const transcript = $('transcript').getBoundingClientRect();
            const composer = document.querySelector('.composer-wrap').getBoundingClientRect();
            return [
                document.documentElement.scrollWidth <= innerWidth,
                composer.height <= $('workspace').clientHeight / 2 + 1,
                transcript.height >= $('workspace').clientHeight * .30,
                transcript.bottom <= composer.top + 1,
                composer.bottom <= innerHeight + 1,
                [...document.querySelectorAll('#output details[open] > summary')].every(el => getComputedStyle(el).position !== 'sticky'),
                getComputedStyle($('latest')).position === 'static',
                getComputedStyle($('earliest')).position === 'static',
                $('prompt').scrollHeight > $('prompt').clientHeight,
            ];
        }''')
        assert all(checks), (width, height, checks)
        page.screenshot(path=os.path.join(temp, f'axiom-mobile-{width}-{height}.png'))
        print(f"PASS mobile {width}x{height}")
    page.set_viewport_size({"width": 1440, "height": 1000})
    page.wait_for_timeout(100)
    prompt.fill("")
    assert prompt.get_attribute("rows") == "3"
    assert prompt.bounding_box()["height"] >= 96
    assert page.locator(".composer-footer").is_visible()
    assert page.locator("#latest").evaluate("el => getComputedStyle(el).position") == "absolute"
    page.screenshot(path=os.path.join(temp, 'axiom-desktop.png'))
    # Compare every element's desktop geometry and computed CSS against the base stylesheet.
    snapshot = '''() => [...document.querySelectorAll('body *')].map(el => {
        const r = el.getBoundingClientRect(), s = getComputedStyle(el);
        return [el.tagName, el.id, r.x, r.y, r.width, r.height,
            ...Array.from(s, key => key.includes('animation') || key === 'transform' ? '' : s.getPropertyValue(key))];
    })'''
    page.emulate_media(reduced_motion='reduce')
    page.mouse.move(0, 0)
    page.locator('#prompt').blur()
    page.wait_for_timeout(200)
    # Reload both versions through normal CSS loading (preserves parser behavior).
    page.reload()
    page.wait_for_selector('#workspace:not([hidden])')
    page.wait_for_timeout(400)
    page.evaluate("document.querySelector('.mobile-controls').remove(); document.getElementById('transcript').scrollTop = 0; document.getElementById('earliest').hidden = true; document.getElementById('latest').hidden = true")
    current = page.evaluate(snapshot)
    for name in ['style.css']:
        base = subprocess.check_output(['git', 'show', f'HEAD:public/{name}'], cwd=Path(__file__).resolve().parents[1]).decode('utf-8') + '\n.mobile-controls { display: none; }'
        route_path = '/' if name == 'index.html' else '/' + name
        mime = 'text/html' if name.endswith('html') else ('text/css' if name.endswith('css') else 'text/javascript')
        page.route(url + route_path, lambda route, request, body=base, kind=mime: route.fulfill(body=body, content_type=kind))
    page.reload()
    page.wait_for_selector('#workspace:not([hidden])')
    page.wait_for_timeout(400)
    page.evaluate("document.querySelector('.mobile-controls').remove(); document.getElementById('transcript').scrollTop = 0; document.getElementById('earliest').hidden = true; document.getElementById('latest').hidden = true")
    compared = page.evaluate(snapshot)
    differences = [(a[:7], b[:7], [(i, x, y) for i, (x, y) in enumerate(zip(a, b)) if x != y][:5]) for a, b in zip(current, compared) if a != b]
    assert not differences, differences[:3]
    assert not errors, errors
    print("PASS desktop base/current computed styles and geometry identical; no page errors")
    browser.close()
