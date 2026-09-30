"""Screenshot regression: synthetic data only; real Chromium, not a device/IME claim."""
import json, os, socket, subprocess, sys, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

root = Path(__file__).resolve().parents[1]
out = Path(sys.argv[1] if len(sys.argv) > 1 else os.environ.get('TEMP', '/tmp')) / 'mobile-feedback'
out.mkdir(parents=True, exist_ok=True)
with socket.socket() as sock:
    sock.bind(('127.0.0.1', 0)); port = sock.getsockname()[1]
server = subprocess.Popen(['node', 'tests/conversation-preview.mjs'], cwd=root, env={**os.environ, 'PREVIEW_PORT':str(port)}, stdout=subprocess.DEVNULL)
try:
    url = f'http://127.0.0.1:{port}'
    for _ in range(100):
        try: urllib.request.urlopen(url, timeout=1).close(); break
        except OSError: time.sleep(.1)
    else: raise AssertionError('preview did not start')
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={'width':390,'height':844}, has_touch=True)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.add_init_script('localStorage.setItem("axiom.session", "ui-long")')
        page.goto(url); page.wait_for_selector('#workspace:not([hidden])'); page.wait_for_timeout(400)
        # A real upward wheel/keyboard move pauses follow; taps and typing do not.
        def scroll_state():
            return page.locator('#transcript').evaluate('(e)=>({top:e.scrollTop,gap:e.scrollHeight-e.clientHeight-e.scrollTop,hidden:document.getElementById("latest").hidden})')
        assert scroll_state()['hidden']
        page.locator('#transcript').click(position={'x':150,'y':100})
        page.evaluate("() => { const e=document.createElement('div');e.style.height='300px';document.getElementById('output').append(e); }")
        page.wait_for_timeout(100)
        assert scroll_state()['hidden'] and scroll_state()['gap'] < 2
        page.mouse.move(180, 250); page.mouse.wheel(0, -500); page.wait_for_timeout(200)
        assert not scroll_state()['hidden'] and scroll_state()['gap'] > 80, scroll_state()
        top = scroll_state()['top']
        page.locator('#prompt').fill('synthetic draft')
        page.evaluate("() => { const e=document.createElement('div');e.style.height='300px';document.getElementById('output').append(e); }")
        page.wait_for_timeout(100)
        assert abs(scroll_state()['top'] - top) < 2
        page.locator('#latest').click(); page.wait_for_timeout(100)
        assert scroll_state()['hidden'] and scroll_state()['gap'] < 2
        page.locator('#transcript').focus(); page.keyboard.press('PageUp'); page.wait_for_timeout(300)
        assert not scroll_state()['hidden']
        page.locator('#latest').click(); page.wait_for_timeout(100)
        # Touch gesture through CDP, not an untrusted DOM scroll event.
        cdp = page.context.new_cdp_session(page)
        cdp.send('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[{'x':180,'y':180}]})
        for y in [220,260,300,340,380]:
            cdp.send('Input.dispatchTouchEvent', {'type':'touchMove','touchPoints':[{'x':180,'y':y}]}); page.wait_for_timeout(30)
        cdp.send('Input.dispatchTouchEvent', {'type':'touchEnd','touchPoints':[]}); page.wait_for_timeout(300)
        assert not scroll_state()['hidden'], scroll_state()
        page.locator('#latest').click(); page.locator('#prompt').fill('')
        # Mount production Todo renderer with local immutable fixtures; never reads SQLite.
        page.evaluate('''async () => {
            const {createTodoUI}=await import('/todo.js');
            window.fixtureVersion=1;
            window.fixtureParents=Array.from({length:4},(_,i)=>({id:'p'+i,level:1,title:'目标 '+i+' · 保留长列表和阅读位置',status:'running',description:'  保留缩进\\n'+'完整说明'.repeat(50),summary:'结果 v1'}));
            window.fixtureChildren=Array.from({length:30},(_,i)=>({id:'c'+i,parentId:'p0',level:2,title:'步骤 '+i+' · 验证状态更新不丢内容',status:'running',summary:'步骤结果'}));
            window.fixtureSnapshot=()=>({listId:'synthetic',version:fixtureVersion,header:{},counts:{targets:{total:4,running:4}},items:fixtureParents,hasMore:false,nextOffset:null});
            const dock=document.getElementById('todo-dock'),fixtureDock=dock.cloneNode(false);
            dock.replaceWith(fixtureDock); // Isolate production session updates from local fixture state.
            window.fixtureTodo=createTodoUI({root:fixtureDock,request:async(_,q)=>{
                const s=fixtureSnapshot();
                if(!q.itemId) return s;
                if(q.section) return {...s,verification:[]};
                if(q.detail) return {...s,item:[...fixtureParents,...fixtureChildren].find(i=>i.id===q.itemId)};
                const all=q.itemId==='p0'?fixtureChildren:[];
                const offset=q.offset||0, end=offset+(q.limit||20);
                return {...s,items:all.slice(offset,end),hasMore:end<all.length,nextOffset:end<all.length?end:null};
            }});
            fixtureTodo.show('synthetic',fixtureSnapshot());
            window.longPrompt='    indented first line\\n'+'https://example.invalid/'+ 'long_segment_'.repeat(120)+'\\n'+('中文原始内容保留换行与缩进。'.repeat(20)+'\\n').repeat(25);
        }''')
        page.wait_for_selector('.todo-child')
        # Keep an open long detail and its middle reading position during a broadcast.
        page.locator('[data-id="p0"] > .todo-item-title').click()
        page.wait_for_selector('[data-id="p0"] > .todo-detail')
        page.locator('.composer-activity').evaluate('e=>e.scrollTop=350')
        page.wait_for_timeout(100)
        detail_top=page.locator('.composer-activity').evaluate('e=>e.scrollTop')
        page.evaluate('fixtureVersion++; fixtureTodo.show("synthetic",fixtureSnapshot())')
        page.wait_for_timeout(100)
        expect(page.locator('[data-id="p0"] > .todo-item-title')).to_have_attribute('aria-expanded','true')
        assert abs(page.locator('.composer-activity').evaluate('e=>e.scrollTop')-detail_top)<3
        page.locator('.todo-toggle').click();page.locator('.todo-toggle').click();page.wait_for_selector('.todo-child')
        for theme in ['dark','light']:
            page.evaluate('(t)=>document.documentElement.dataset.theme=t',theme)
            for width,height in [(390,844),(320,568),(390,420),(667,375)]:
                page.set_viewport_size({'width':width,'height':height}); page.wait_for_timeout(100)
                page.locator('#prompt').fill('草稿\n'*30)
                # Header/compose controls survive while the long list scrolls internally.
                page.locator('.composer-activity').evaluate('e=>e.scrollTop=800')
                page.wait_for_timeout(100)
                geometry=page.evaluate('''()=>{
                    const a=document.querySelector('.composer-activity').getBoundingClientRect(), h=document.querySelector('.todo-header').getBoundingClientRect(),p=document.querySelector('#prompt').getBoundingClientRect(),s=document.querySelector('.composer-split').getBoundingClientRect();
                    return {a:a.toJSON(),h:h.toJSON(),p:p.toJSON(),s:s.toJSON(),height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth};
                }''')
                assert geometry['a']['height'] >= 80, geometry
                assert geometry['h']['top'] >= geometry['a']['top']-1 and geometry['h']['bottom'] <= geometry['a']['bottom']+1, geometry
                assert geometry['p']['bottom'] <= height and geometry['s']['bottom'] <= height and not geometry['overflow'], geometry
                old_top=page.locator('.composer-activity').evaluate('e=>e.scrollTop')
                page.evaluate('fixtureVersion++; fixtureParents[0].summary="fresh result"; fixtureTodo.show("synthetic",fixtureSnapshot())')
                page.wait_for_timeout(100)
                assert abs(page.locator('.composer-activity').evaluate('e=>e.scrollTop')-old_top)<3
                page.screenshot(path=str(out/f'{theme}-todo-{width}-{height}.png'))
                # The sticky title really receives the click (not just visible by geometry).
                page.locator('.todo-toggle').click(); expect(page.locator('#todo-list')).not_to_be_visible()
                assert page.locator('#prompt').input_value() == '草稿\n'*30
                page.locator('.todo-toggle').click(); page.wait_for_selector('.todo-child')
                # Single-layer menu and stable close target in both themes.
                page.locator('#mobile-more').click()
                expect(page.locator('#view-options-trigger')).not_to_be_visible()
                expect(page.locator('#mobile-view-slot #toggle-theme')).to_be_visible()
                close=page.locator('#mobile-menu-close').bounding_box()
                assert close['width']>=48 and close['height']>=48
                for selector in ['#mobile-menu-close svg','#mobile-more svg']:
                    assert page.locator(selector).evaluate('e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width===20&&r.height===20&&s.stroke!=="none"}')
                page.locator('#mobile-menu').evaluate('e=>e.scrollTop=e.scrollHeight')
                close=page.locator('#mobile-menu-close').bounding_box()
                assert close['y']>=0 and close['y']+close['height']<=height
                page.locator('#mobile-menu').evaluate('e=>e.scrollTop=0')
                page.screenshot(path=str(out/f'{theme}-menu-{width}-{height}.png'))
                page.locator('#mobile-menu-close').click()
                expect(page.locator('#mobile-more')).to_be_focused()
                assert page.locator('#session-title').is_hidden()
                # Production dialog, original content untouched: no horizontal clipping.
                page.locator('.composer-tools-trigger').click(); page.locator('.composer-session-info').click()
                page.locator('#inspector-prompt-tab').click()
                page.evaluate("document.getElementById('session-system-prompt').textContent=longPrompt")
                expect(page.locator('#session-system-prompt')).to_be_visible()
                expect(page.locator('#session-detail')).to_be_visible()
                assert page.locator('#session-system-prompt').evaluate('e=>e.textContent===longPrompt && getComputedStyle(e).whiteSpace==="pre-wrap" && e.scrollWidth<=e.clientWidth+1')
                page.locator('#session-detail .task-body').evaluate('e=>e.scrollTop=e.scrollHeight/2')
                close=page.locator('#session-detail-close').bounding_box()
                assert close and close['y']>=0 and close['y']+close['height']<=height
                page.screenshot(path=str(out/f'{theme}-prompt-{width}-{height}.png'))
                page.locator('#session-detail .task-body').evaluate('e=>e.scrollTop=0')
                page.locator('#inspector-tools-tab').click()
                page.locator('#session-active-tools details').evaluate_all('es=>es.forEach(e=>e.open=true)')
                page.locator('#session-active-tools p').first.evaluate('e=>e.textContent="工具说明_".repeat(300)')
                assert page.locator('#session-detail .task-body').evaluate('e=>e.scrollWidth<=e.clientWidth+1')
                page.locator('#session-detail-close').click()
                print(f'PASS {theme} {width}x{height}: menu, long prompt/tools, Todo, controls')
        assert not errors, errors
        browser.close()
    print('PASS wheel/keyboard/touch follow, no page errors; no device/IME claim')
finally:
    server.terminate()
    try: server.wait(timeout=10)
    except subprocess.TimeoutExpired: server.kill(); server.wait(timeout=10)
