"""Isolated UI regression: python tests/ui-polish-browser.py [artifact-dir]. No model/user data."""
from pathlib import Path
import json, os, re, shutil, socket, subprocess, sys, time, urllib.request
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else ROOT / '.ui-polish-artifacts'
OUT.mkdir(parents=True, exist_ok=True)

def source(name):
    text = (ROOT / 'public' / f'{name}.js').read_text(encoding='utf-8')
    return re.sub(r'^import .*;\r?\n', '', text, flags=re.M).replace('export ', '')

with socket.socket() as sock:
    sock.bind(('127.0.0.1', 0)); port = sock.getsockname()[1]
log = (OUT / 'preview.log').open('w', encoding='utf-8')
process = subprocess.Popen([shutil.which('node'), 'tests/conversation-preview.mjs'], cwd=ROOT,
    env={**os.environ, 'PREVIEW_PORT': str(port)}, stdout=log, stderr=subprocess.STDOUT)
url = f'http://127.0.0.1:{port}'
try:
    for _ in range(100):
        if process.poll() is not None: raise RuntimeError('preview exited')
        try:
            urllib.request.urlopen(url, timeout=1).close(); break
        except OSError: time.sleep(.1)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        for width, height in [(1440, 1000), (768, 900), (390, 844), (320, 640), (1000, 560)]:
            page.set_viewport_size({'width': width, 'height': height})
            page.goto(url + '/#session=ui-compaction')
            page.wait_for_selector('#workspace:not([hidden])')
            for theme in ['light', 'dark']:
                page.evaluate('(theme) => document.documentElement.dataset.theme = theme', theme)
                page.locator('#output > .compaction-card > summary').first.click()
                page.locator('.compaction-card .task-card').first.click()
                dialog = page.locator('.task-dialog[open]')
                expect(dialog).to_be_visible()
                body = dialog.locator('.task-body')
                assert body.bounding_box()['height'] >= 100, f'body too small {width}x{height}'
                assert dialog.evaluate('(e) => e.scrollWidth <= e.clientWidth + 1')
                expect(dialog.locator('.task-context > summary')).to_be_visible()
                dialog.locator('.task-context > summary').click()
                expect(dialog.locator('.task-description')).to_be_visible()
                dialog.locator('.task-context > summary').click()
                page.screenshot(path=str(OUT / f'subagent-{width}-{height}-{theme}.png'))
                page.keyboard.press('Escape')
                page.locator('#output > .compaction-card > summary').first.click()
                page.locator('.compaction-progress-open').click()
                documents = page.locator('#compaction-documents')
                expect(documents.locator('details').first.locator('summary')).to_have_text('最终摘要')
                assert documents.locator('details').first.evaluate('(e) => e.open')
                for toolbar in documents.locator('.compaction-document-actions:visible').all():
                    assert toolbar.evaluate('(e) => e.scrollWidth <= e.clientWidth + 1')
                page.screenshot(path=str(OUT / f'compaction-{width}-{height}-{theme}.png'))
                page.keyboard.press('Escape')
        # Use actual application CSS and question module, without touching a live session.
        page.close()
        page = browser.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.set_content('<main class="composer-wrap" style="position:fixed;bottom:16px;left:16px;right:16px;width:auto;padding:0;"><div class="composer-activity"><section class="question-dock" id="dock"></section></div></main>')
        for name in ['style.css', 'question.css']:
            page.add_style_tag(content=(ROOT / 'public' / name).read_text(encoding='utf-8'))
        page.add_script_tag(content=source('icons') + '\n' + source('question') + '''
            window.ui = createQuestionUI({root:document.querySelector('#dock'), reply:async()=>{}});
            window.goal = {title:'优化确认框与信息展示', description:'基于当前界面优化布局、图标和信息密度，保留已有功能。', acceptance:[
                {criterionId:'a',text:'以可读的目标、范围与标准代替 JSON',check:'review'},
                {criterionId:'b',text:'通过浏览器布局检查',check:'tool'}]};
            window.showProposal = (long) => ui.show('fixture', [{toolCallId:long?'long':'short',proposal:{changes:Array.from({length:long?3:1},()=>({before:null,after:{...goal,description:long?goal.description.repeat(15):goal.description}}))},questions:[{header:'目标',question:'是否确认以下目标？',description:'确认后开始实施；需要调整时填写意见。',options:[{label:'同意',description:'按这些要求执行'},{label:'拒绝',description:'不应用这次变更'}]}]}]);
            showProposal(false);
        ''')
        metrics = []
        for width, height in [(1440, 1000), (768, 900), (390, 844), (320, 640), (1000, 560)]:
            page.set_viewport_size({'width': width, 'height': height})
            for theme in ['light', 'dark']:
                page.evaluate('(theme) => document.documentElement.dataset.theme = theme', theme)
                page.evaluate('showProposal(false)')
                page.wait_for_timeout(100)
                assert page.locator('.question-technical').evaluate('(e) => !e.open')
                assert page.locator('.question-submit').is_disabled()
                assert page.locator('.question-mode').count() == 0
                assert page.locator('.question-goal-description').inner_text().startswith('基于当前界面')
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
                for selector in ['.composer-wrap', '#dock', '.question-choice', '.question-submit']:
                    for element in page.locator(selector).all():
                        bounds = element.bounding_box()
                        assert bounds and bounds['width'] > 0 and bounds['x'] >= -1 and bounds['x'] + bounds['width'] <= width + 1, (selector, bounds)
                choice = page.locator('.question-choice').first
                expect(choice).to_have_attribute('aria-checked', 'false')
                choice.hover()
                page.wait_for_timeout(200)
                assert choice.evaluate('''e => {
                    const probe = document.createElement('span');
                    probe.style.backgroundColor = 'var(--hover, #18191a)';
                    e.append(probe);
                    const neutral = getComputedStyle(probe).backgroundColor;
                    const actual = getComputedStyle(e).backgroundColor;
                    probe.remove();
                    return actual === neutral;
                }'''), 'Unchecked choice must use neutral hover background'
                page.mouse.move(0, 0)
                page.wait_for_timeout(200)
                metric = page.locator('.composer-wrap').evaluate('(e)=>({height:e.clientHeight,content:e.scrollHeight})')
                if width >= 768 and height >= 900: assert metric['content'] <= metric['height'] + 1, metric
                metrics.append({'width':width,'height':height,'theme':theme,**metric})
                page.screenshot(path=str(OUT / f'confirmation-{width}-{height}-{theme}.png'))
                page.evaluate('showProposal(true)')
                assert page.locator('.question-proposal').evaluate('(e)=>getComputedStyle(e).overflowY === "visible"')
                page.locator('.composer-activity' if width <= 700 else '.composer-wrap').evaluate('(e)=>e.scrollTop=e.scrollHeight')
                page.locator('.question-choice').first.click()
                assert not page.locator('.question-submit').is_disabled()
                assert page.locator('.question-submit').bounding_box()['y'] + page.locator('.question-submit').bounding_box()['height'] <= height
                page.locator('.question-technical > summary').focus()
                expect(page.locator('.question-technical > summary')).to_be_focused()
                page.keyboard.press('Enter')
                expect(page.locator('.question-technical')).to_have_attribute('open', '')
                page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
                expect(page.locator('.question-technical > summary')).to_be_focused()
                expect(page.locator('.question-technical')).to_have_attribute('open', '')
                page.keyboard.press('Space')
                expect(page.locator('.question-technical')).not_to_have_attribute('open', '')
                page.locator('.question-technical > summary').click()
                expect(page.locator('.question-technical')).to_have_attribute('open', '')
                assert page.locator('#dock').is_visible(), 'technical disclosure must not submit approval'
        page.emulate_media(reduced_motion='reduce')
        assert not errors, errors
        (OUT / 'metrics.json').write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding='utf-8')
        browser.close()
    subprocess.run([sys.executable, 'tests/compaction-ui.py', str(OUT / 'existing-compaction')], cwd=ROOT,
        env={**os.environ, 'PREVIEW_PORT': str(port)}, check=True, timeout=180)
finally:
    process.terminate()
    try: process.wait(timeout=10)
    except subprocess.TimeoutExpired: process.kill(); process.wait(timeout=10)
    log.close()
print(f'PASS: real UI, both themes, 5 viewport sizes, safe readable proposals, Subagent and compaction. Artifacts: {OUT}')
