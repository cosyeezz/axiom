"""Isolated Todo regression: python tests/todo-ui-browser.py [artifact-dir].

Loads real ESM and application CSS through in-memory HTTP routes. No server,
model calls, network access or user sessions. Requires Python Playwright/Chromium.
"""
from pathlib import Path
import json
import sys
import tempfile
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(tempfile.mkdtemp(prefix='axiom-todo-ui-'))
OUT.mkdir(parents=True, exist_ok=True)
HTML = '''<!doctype html><html data-theme="dark"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/todo.css">
<style>body { display:block; height:auto; overflow:auto; padding:16px; }
main { max-width:860px; margin:auto; }</style></head><body><main>
<section id="todo-dock" aria-label="任务清单"></section></main>
<script type="module">
import { createTodoUI } from '/todo.js';
const items = [
  { id:'running', status:'running', title:'优化任务清单的两级展示', summary:'检查桌面、移动端和键盘操作。' },
  { id:'next', status:'pending', title:'同步文档并交付验证结果' },
].map(item => ({ ...item, level:1 }));
const children = window.children = [
  { id:'research', status:'done', title:'确认交互与布局方案' },
  { id:'implementation', status:'running', title:'默认展示两级任务，点击查看详情', summary:'将步骤列表与目标详情分离。' },
  { id:'pending', status:'pending', title:'核对多行标题：中文和 English words 应正常换行，图标始终对齐标题首行。' },
  { id:'blocked', status:'blocked', title:'确认受阻任务', blocker:'等待验收，不把颜色作为唯一状态信息。' },
  { id:'long', status:'pending', title:'VeryLongUnbrokenIdentifier'.repeat(15) },
].map(item => ({...item,level:2,parentId:'running'}));
window.fixture = { listId:'fixture-list', version:1, header:{paused:false},
  counts:{targets:{total:2,done:0,pending:1,running:1,blocked:0}},
  items, coverage:{complete:true}, hasMore:false, nextOffset:null };
window.requests = [];
window.ui = createTodoUI({root:document.querySelector('#todo-dock'), request:async(method, params) => {
  requests.push({method, params});
  if (window.failNext) { window.failNext = false; throw new Error('测试读取失败'); }
  if (method === 'todo.action') {
    fixture = {...fixture, version:fixture.version+1,
      header:{paused:params.action==='pause'}, cancelled:params.action==='cancel_prepare'};
    return structuredClone(fixture);
  }
  if (params.section === 'verification') return {version:fixture.version,verification:params.itemId==='running' ? [
    {criterionId:'aligned',result:'首行图标偏移小于1px',refs:[{toolCallId:'browser-check'}]}] : []};
  if (params.itemId) return {version:fixture.version,
    item:{...[...items,...children].find(i=>i.id===params.itemId),
      description:params.itemId==='running'?'保持已确认的目标要求。':'当前步骤的独立说明。',
      acceptance:params.itemId==='running'?[{criterionId:'aligned',text:'首行对齐',check:'tool'}]:[]},
    items:params.itemId==='running'?children:[],hasMore:false,nextOffset:null};
  return structuredClone(fixture);
}});
window.reset = () => ui.show('fixture', fixture);
reset();
window.ready = true;
</script></body></html>'''


def route(request):
    name = request.request.url.removeprefix('http://todo.test/')
    if name == '':
        request.fulfill(status=200, content_type='text/html', body=HTML)
    elif name in ('style.css', 'todo.css', 'icons.js', 'todo.js'):
        request.fulfill(status=200, content_type='text/css' if name.endswith('.css') else 'text/javascript',
                        body=(ROOT / 'public' / name).read_text(encoding='utf-8'))
    else:
        request.abort()


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.route('**/*', route)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto('http://todo.test/')
    page.wait_for_function('window.ready')
    assert page.evaluate('''() => getComputedStyle(document.body).fontFamily.includes('Segoe UI') &&
      getComputedStyle(document.querySelector('.todo-toggle')).fontFamily === getComputedStyle(document.body).fontFamily
    '''), 'Fixture must inherit the real application font, not a browser serif default'
    toggle = page.locator('.todo-toggle')
    action = page.locator('.todo-header > .todo-action')
    expect(toggle).to_have_attribute('aria-expanded', 'true')
    expect(toggle).to_have_attribute('aria-controls', 'todo-list')
    expect(toggle.locator('[data-icon="checklist"]')).to_have_count(1)
    expect(page.locator('.todo-child')).to_have_count(5)
    expect(page.locator('.todo-detail')).to_have_count(0)
    assert page.evaluate('requests.every(r=>!r.params.detail&&!r.params.section)'), 'Default tree loads summaries only'
    toggle.click()
    expect(page.locator('.todo-row')).to_have_count(0)
    toggle.focus()
    page.keyboard.press('Enter')
    expect(toggle).to_have_attribute('aria-expanded', 'true')
    expect(page.locator('.todo-list > .todo-row')).to_have_count(2)
    expect(page.locator('.todo-child')).to_have_count(5)
    expect(toggle).to_be_focused()
    assert page.evaluate('localStorage.getItem("axiom.todoExpanded")') == '1'
    metrics = []
    for width, height in [(1440, 1000), (768, 900), (480, 800), (390, 844), (320, 640)]:
        page.set_viewport_size({'width': width, 'height': height})
        for theme in ('light', 'dark'):
            page.evaluate('(theme) => document.documentElement.dataset.theme = theme', theme)
            measurements = page.evaluate('''() => {
              const box = e => e.getBoundingClientRect();
              return [...document.querySelectorAll('.todo-item-title')].map(button => {
                const label = button.querySelector('.todo-item-label');
                const svg = button.querySelector('svg');
                const text = box(label), icon = box(svg);
                return {title:label.textContent.slice(0,20),height:box(button).height,
                  delta:Math.abs(icon.y+icon.height/2-text.y-parseFloat(getComputedStyle(label).lineHeight)/2),
                  lines:text.height/parseFloat(getComputedStyle(label).lineHeight),
                  wraps:getComputedStyle(label).whiteSpace,svgWidth:icon.width};
              });
            }''')
            for metric in measurements:
                assert metric['delta'] <= .5, (width, theme, metric)
                assert metric['height'] >= (44 if width <= 480 else 40), metric
                assert metric['wraps'] == 'normal', metric
                assert metric['svgWidth'] == 16, metric
            assert next(m for m in measurements if m['title'].startswith('VeryLongUnbroken'))['lines'] > 1, 'Multiline case must actually wrap'
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            for selector in ('.todo-list', '.todo-toggle', '.todo-header'):
                assert page.locator(selector).evaluate('(e)=>e.scrollWidth <= e.clientWidth+1'), (width, selector)
            identity = page.locator('.todo-identity')
            assert identity.evaluate('''e => {
              const b=e.getBoundingClientRect();
              return [...e.children].every(c=>{
                const r=c.getBoundingClientRect();
                return Math.abs(r.y+r.height/2-b.y-b.height/2)<.5;
              });
            }''')
            for badge in page.locator('.todo-count[data-status]').all():
                assert badge.evaluate('''e => {
                  const svg=e.querySelector('svg').getBoundingClientRect();
                  const text=e.lastElementChild.getBoundingClientRect();
                  return Math.abs(svg.y+svg.height/2-text.y-text.height/2)<.5;
                }''')
            title = page.locator('.todo-item-title').first
            title.hover()
            assert title.evaluate('''e => {
              const probe=document.createElement('span'); probe.style.background='var(--hover)';
              e.append(probe); const expected=getComputedStyle(probe).backgroundColor; probe.remove();
              return getComputedStyle(e).backgroundColor===expected;
            }'''), 'Global primary hover must not leak into task titles'
            page.mouse.move(0, 0)
            page.screenshot(path=str(OUT / f'todo-expanded-{width}-{theme}.png'))
            metrics.append({'width': width, 'theme': theme, 'rows': measurements})
            toggle.click()
            expect(page.locator('.todo-list')).to_be_hidden()
            expect(toggle.locator('[data-icon="checklist"]')).to_be_visible()
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            page.screenshot(path=str(OUT / f'todo-collapsed-{width}-{theme}.png'))
            toggle.click()
            expect(page.locator('.todo-list > .todo-row')).to_have_count(2)
            expect(page.locator('.todo-child')).to_have_count(5)

    # Detail/child/evidence UI and disclosure keyboard behavior use actual request parameters.
    title = page.locator('.todo-item-title').first
    title.focus()
    page.keyboard.press('Space')
    expect(title).to_have_attribute('aria-expanded', 'true')
    expect(page.locator('.todo-evidence')).to_have_text('工具依据：browser-check')
    expect(page.locator('.todo-child')).to_have_count(5)
    expect(page.locator('[data-id="research"] .todo-item-title')).to_have_accessible_name('确认交互与布局方案，已完成')
    assert page.evaluate("requests.some(r=>r.params.itemId==='running'&&r.params.detail===true)")
    page.keyboard.press('Enter')
    expect(title).to_have_attribute('aria-expanded', 'false')
    expect(page.locator('.todo-detail')).to_have_count(0)
    expect(page.locator('.todo-child')).to_have_count(5)
    child_title = page.locator('[data-id="implementation"] .todo-item-title')
    child_title.focus()
    page.keyboard.press('Enter')
    expect(page.locator('.todo-child .todo-detail')).to_contain_text('将步骤列表与目标详情分离。')
    expect(page.locator('.todo-child .todo-detail')).to_contain_text('当前步骤的独立说明。')
    expect(page.locator('.todo-list > .todo-row > .todo-detail')).to_have_count(0)
    page.keyboard.press('Space')
    expect(page.locator('.todo-detail')).to_have_count(0)

    # Real Chromium must retain focused child buttons during unchanged and reordered reads.
    page.evaluate('fixture.version++; reset()')
    expect(child_title).to_be_focused()
    page.evaluate('children.reverse(); fixture.version++; reset()')
    expect(child_title).to_be_focused()
    page.evaluate('children.reverse(); fixture.version++; reset()')
    expect(child_title).to_be_focused()

    # Delta updates replace both the icon and accessible status, not just the visible title.
    page.evaluate('''() => { fixture.version++; fixture.items[0].status='done';
      fixture.items[0].title='已更新的任务';
      ui.show('fixture',{...fixture,items:undefined,changed:[fixture.items[0]]}); }''')
    expect(title).to_have_accessible_name('已更新的任务，已完成')
    expect(title.locator('svg')).to_have_attribute('data-icon', 'check')
    page.evaluate("ui.show('fixture',{...fixture,version:0,changed:[{...fixture.items[0],title:'过期结果'}]})")
    expect(title).to_have_accessible_name('已更新的任务，已完成')

    # Pausing/resuming is independent of disclosure; disconnected actions stay disabled.
    await_expanded = toggle.get_attribute('aria-expanded')
    action.click()
    expect(action).to_have_text('恢复')
    expect(toggle).to_have_attribute('aria-expanded', await_expanded)
    action.click()
    expect(action).to_have_text('暂停')
    assert page.evaluate("requests.filter(r=>r.method==='todo.action').map(r=>r.params.action)") == ['pause', 'resume']
    page.evaluate('ui.setConnected(false)')
    expect(action).to_be_disabled()
    page.evaluate('ui.setConnected(true)')
    expect(action).to_be_enabled()

    # Real origin/localStorage, persistence and cross-tab collapse.
    toggle.focus()
    page.keyboard.press('Space')
    expect(toggle).to_have_attribute('aria-expanded', 'false')
    expect(page.locator('.todo-row')).to_have_count(0)
    page.reload()
    page.wait_for_function('window.ready')
    expect(toggle).to_have_attribute('aria-expanded', 'false')
    toggle.click()
    page.reload()
    page.wait_for_function('window.ready')
    expect(toggle).to_have_attribute('aria-expanded', 'true')
    expect(page.locator('.todo-list > .todo-row')).to_have_count(2)
    expect(page.locator('.todo-child')).to_have_count(5)
    page.evaluate("window.dispatchEvent(new StorageEvent('storage',{key:'axiom.todoExpanded',newValue:'0'}))")
    expect(toggle).to_have_attribute('aria-expanded', 'false')
    expect(page.locator('.todo-row')).to_have_count(0)

    # Large counts, 200% CSS zoom, forced colors and focus remain usable.
    page.evaluate("fixture.counts.targets={total:12345,done:10000,pending:1234,running:1110,blocked:1}; reset()")
    page.set_viewport_size({'width': 640, 'height': 900})
    page.evaluate("document.documentElement.style.zoom='2'")
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path=str(OUT / 'todo-collapsed-zoom-200.png'))
    toggle.click()
    expect(page.locator('.todo-list > .todo-row')).to_have_count(2)
    expect(page.locator('.todo-child')).to_have_count(5)
    assert page.locator('.todo-list').evaluate('(e)=>e.scrollWidth <= e.clientWidth+1')
    page.screenshot(path=str(OUT / 'todo-expanded-zoom-200.png'))
    toggle.click()
    page.evaluate("document.documentElement.style.zoom=''")
    page.emulate_media(forced_colors='active', reduced_motion='reduce')
    page.keyboard.press('Tab')  # Enter keyboard modality after the mouse zoom checks.
    toggle.focus()
    assert toggle.evaluate('(e)=>getComputedStyle(e).outlineStyle') != 'none'
    page.keyboard.press('Enter')
    expect(page.locator('.todo-list')).to_be_visible()
    page.screenshot(path=str(OUT / 'todo-forced-colors.png'))
    page.emulate_media(forced_colors='none')

    # A representative compact tree (without stress-test identifiers) for visual review.
    page.evaluate("children.pop(); fixture.counts.targets={total:2,done:0,pending:1,running:1,blocked:0}; fixture.version++; reset(); document.activeElement.blur()")
    page.mouse.move(0, 0)
    for width in (1440, 390, 320):
        page.set_viewport_size({'width': width, 'height': 900})
        for theme in ('light', 'dark'):
            page.evaluate('(theme)=>document.documentElement.dataset.theme=theme', theme)
            page.locator('.todo-list').evaluate('(e)=>e.scrollTop=0')
            page.screenshot(path=str(OUT / f'todo-tree-{width}-{theme}.png'))

    # Completed/cancelled/preparation semantics remain intact.
    page.evaluate("ui.show('fixture',{...fixture,completed:true})")
    expect(action).to_have_text('已完成')
    expect(action).to_be_disabled()
    page.evaluate("ui.show('fixture',{...fixture,cancelled:true})")
    expect(action).to_have_text('已取消')
    expect(action).to_be_disabled()
    page.evaluate("fixture.header={requirePlan:true}; reset()")
    expect(action).to_have_text('取消创建')
    action.click()
    expect(action).to_have_text('已取消')
    assert page.evaluate("requests.filter(r=>r.method==='todo.action').at(-1).params.action") == 'cancel_prepare'
    page.evaluate("ui.show('other-session',null)")
    expect(page.locator('#todo-dock')).to_be_hidden()
    expect(page.locator('.todo-row')).to_have_count(0)

    assert not errors, errors
    (OUT / 'metrics.json').write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding='utf-8')
    browser.close()
print(f'PASS: Todo ESM/CSS, 5 widths, both themes, first-line alignment, wrapping, state updates, keyboard and actions. Artifacts: {OUT}')
