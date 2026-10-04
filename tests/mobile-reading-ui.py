"""Run against tests/conversation-preview.mjs (no model or user data).
Without PREVIEW_URL starts/cleans an isolated server. Screenshots use UI_EVIDENCE_DIR/TEMP.
"""
import json
import os
import subprocess
import socket, sys, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
out = Path(os.environ.get('UI_EVIDENCE_DIR', os.environ.get('TEMP', '/tmp')))
out.mkdir(parents=True, exist_ok=True)
url = os.environ.get('PREVIEW_URL')
if not url:
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0)); port=sock.getsockname()[1]
    with (out / 'preview.log').open('w', encoding='utf-8') as log:
        process=subprocess.Popen(['node','tests/conversation-preview.mjs'],cwd=root,env={**os.environ,'PREVIEW_PORT':str(port)},stdout=log,stderr=subprocess.STDOUT)
        try:
            url=f'http://127.0.0.1:{port}'
            for _ in range(100):
                if process.poll() is not None: raise RuntimeError('preview exited')
                try: urllib.request.urlopen(url,timeout=1).close(); break
                except OSError: time.sleep(.1)
            result=subprocess.run([sys.executable,__file__],cwd=root,env={**os.environ,'PREVIEW_URL':url},timeout=150)
        finally:
            process.terminate()
            try: process.wait(timeout=10)
            except subprocess.TimeoutExpired: process.kill(); process.wait(timeout=10)
    sys.exit(result.returncode)
base_css = subprocess.check_output(['git', 'show', 'fa913c8:public/style.css'], cwd=root).decode('utf-8')

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={'width': 390, 'height': 844}, has_touch=True)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.add_init_script('localStorage.setItem("axiom.session", "ui-review")')
    page.goto(url)
    page.wait_for_selector('#workspace:not([hidden])')
    page.wait_for_timeout(300)
    prompt = page.locator('#prompt')
    assert prompt.is_visible() and page.locator('.mobile-controls').is_hidden()
    assert page.locator('#toggle-sidebar').is_visible()
    assert page.locator('#mobile-more').is_hidden()
    def menu():
        page.locator('#toggle-sidebar').click()
        page.locator('#mobile-more').click()
    page.evaluate('window.originalService = document.querySelector(".service-controls"); window.originalLocation = document.querySelector(".workspace-location")')
    prompt.fill('不丢失的草稿')
    menu()
    assert page.locator('#mobile-menu').is_visible()
    assert page.locator('#mobile-menu #status').is_visible()
    assert page.locator('#mobile-menu #workspace-label').is_visible()
    assert page.locator('#mobile-menu').evaluate('el => getComputedStyle(el).backgroundColor') == 'rgb(15, 16, 17)'
    page.keyboard.press('Escape')
    assert page.locator('#mobile-menu').is_hidden()
    assert page.locator('#toggle-sidebar').evaluate('el => el === document.activeElement')
    assert prompt.input_value() == '不丢失的草稿'
    menu()
    assert page.locator('#view-options').is_visible()
    assert page.locator('#view-options-trigger').is_hidden()
    page.locator('#open-raw-io').click()
    page.wait_for_timeout(100)  # dialog close is asynchronous in a real browser
    assert page.locator('#raw-io').is_visible()
    assert page.locator('#close-raw-io').evaluate('el => el === document.activeElement')
    page.locator('#close-raw-io').click()
    assert page.locator('#toggle-sidebar').evaluate('el => el === document.activeElement')
    menu()
    page.locator('#mobile-connection').click()
    assert page.locator('#settings').is_visible()
    page.keyboard.press('Escape')
    # Restore a clean fixture for geometry, then compare exactly the same Markdown.
    page.reload(); page.wait_for_selector('#workspace:not([hidden])'); page.wait_for_timeout(300)
    page.evaluate('window.originalService = document.querySelector(".service-controls"); window.originalLocation = document.querySelector(".workspace-location")')
    measure = '''() => {
        const el = [...document.querySelectorAll('#output > .message:not(.user) > .markdown')].find(el => el.textContent.includes('会话展示'));
        const css = getComputedStyle(el);
        return {font:css.fontSize, line:css.lineHeight, height:el.getBoundingClientRect().height,
            header:document.querySelector('main > header').getBoundingClientRect().height,
            transcript:document.getElementById('transcript').getBoundingClientRect().height};
    }'''
    current = page.evaluate(measure)
    baseline_page=browser.new_page(viewport={'width':390,'height':844},has_touch=True)
    baseline_page.add_init_script('localStorage.setItem("axiom.session", "ui-review")')
    baseline_page.route('**/style.css',lambda route:route.fulfill(status=200,content_type='text/css',body=base_css+'\n#mobile-more {display:none!important}'))
    baseline_page.goto(url);baseline_page.wait_for_selector('#workspace:not([hidden])');baseline_page.wait_for_timeout(300)
    baseline = baseline_page.evaluate(measure)
    assert current['font'] == baseline['font'] == '14px', (current, baseline)
    assert current['line'] == '22.4px' and baseline['line'] == '25.2px', (current, baseline)
    # Collapsed navigation and title no longer reserve any phone reading space.
    assert current['header'] == 0, current
    assert page.locator('#sidebar').is_hidden()
    assert page.locator('main').bounding_box()['x'] == 0
    assert current['height'] <= baseline['height']
    print('METRICS', json.dumps({'before': baseline, 'after': current}))
    for width, height in [(390, 844), (320, 568), (390, 420), (667, 375)]:
        page.set_viewport_size({'width': width, 'height': height})
        page.wait_for_timeout(100)
        prompt.fill('')
        assert prompt.bounding_box()['height'] == 44
        prompt.fill('长草稿\n' * 60)
        assert prompt.bounding_box()['height'] <= min(120, height * .2) + 1
        page.locator('#output details').evaluate_all('els => els.forEach(el => el.open = true)')
        page.evaluate('''() => {
            for (const id of ['task-runs', 'message-queue']) {
                const el=document.getElementById(id); el.hidden=false;
                el.replaceChildren(...Array.from({length:8}, () => {
                    const b=document.createElement('button'); b.textContent='任务或排队消息'; return b;
                }));
            }
        }''')
        checks = page.evaluate('''() => {
            const $=id=>document.getElementById(id), t=$('transcript').getBoundingClientRect(), c=document.querySelector('.composer-wrap').getBoundingClientRect();
            const context=document.querySelector('.composer-context'), action=document.querySelector('.composer-split'), a=action.getBoundingClientRect(), form=$('composer').getBoundingClientRect();
            // The new bottom toolbar takes priority over the old 50% whole-composer cap.
            // Preserve transcript space and scroll auxiliary content, never the actions.
            return [document.documentElement.scrollWidth<=innerWidth,
                c.height<=$('workspace').clientHeight-48+1, t.height>=48-1,
                t.bottom<=c.top+1, c.bottom<=innerHeight+1,
                a.bottom<=form.bottom-1 && a.top>=$('prompt').getBoundingClientRect().bottom,
                action.contains(document.elementFromPoint(a.x+a.width/2, a.bottom-2)),
                getComputedStyle(context).overflowY==='auto' && getComputedStyle(document.querySelector('.composer-wrap')).overflowY==='visible',
                [...document.querySelectorAll('#output details[open] > summary')].every(el=>getComputedStyle(el).position!=='sticky'),
                $('prompt').scrollHeight>$('prompt').clientHeight];
        }''')
        assert all(checks), (width, height, checks)
        for selector in ['.composer-tools-trigger', '#toggle-sidebar']:
            box=page.locator(selector).bounding_box(); assert box['width'] >= 44 and box['height'] >= 44
        page.screenshot(path=str(out / f'mobile-{width}-{height}.png'))
        menu()
        assert page.locator('#mobile-menu-close').is_visible()
        page.screenshot(path=str(out / f'menu-{width}-{height}.png'))
        page.keyboard.press('Escape')
        print(f'PASS mobile {width}x{height}')
    # User text-spacing override: scrollable content and dismiss controls stay reachable.
    page.set_viewport_size({'width':320,'height':568})
    # CSSOM simulates a user override without weakening the fixture's CSP.
    page.evaluate('''() => { const sheet=[...document.styleSheets].find(s=>s.href.endsWith('/style.css')); window.spacingSheet=sheet; window.spacingIndex=sheet.cssRules.length; sheet.insertRule('* {line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}',sheet.cssRules.length); sheet.insertRule('p {margin-bottom:2em!important}',sheet.cssRules.length); }''')
    menu()
    page.locator('#mobile-menu-close').click()
    assert page.locator('#mobile-menu').is_hidden()
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.evaluate('spacingSheet.deleteRule(spacingIndex); spacingSheet.deleteRule(spacingIndex)')
    page.set_viewport_size({'width':1440,'height':1000}); page.wait_for_timeout(100)
    assert page.locator('#mobile-more').is_hidden()
    assert page.evaluate('document.querySelector(".service-controls")===window.originalService && document.querySelector(".workspace-location")===window.originalLocation')
    assert page.locator('#sidebar .service-controls').count() == 1
    assert page.locator('main > header .service-controls').count() == 0
    assert page.locator('main > header .workspace-location').count() == 1
    # Compare desktop reading typography; sidebar/header geometry intentionally changed.
    page.reload(); page.wait_for_selector('#workspace:not([hidden])'); page.wait_for_timeout(300)
    page.emulate_media(reduced_motion='reduce'); page.mouse.move(0,0)
    snapshot='''() => [...document.querySelectorAll('#output, #output *, #composer, #prompt')].map(el=>{
        const s=getComputedStyle(el);
        return [el.tagName,el.id,s.fontSize,s.lineHeight,s.margin,s.padding,s.display];
    })'''
    before=page.evaluate(snapshot)
    baseline_page.set_viewport_size({'width':1440,'height':1000})
    baseline_page.reload();baseline_page.wait_for_selector('#workspace:not([hidden])');baseline_page.wait_for_timeout(300)
    after=baseline_page.evaluate(snapshot)
    assert before == after, [(a,b) for a,b in zip(before,after) if a!=b][:4]
    assert not errors, errors
    print('PASS desktop reading text styles unchanged; sidebar migration, Escape, focus, spacing and no page errors')
    browser.close()
