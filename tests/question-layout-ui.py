"""Run: python tests/question-layout-ui.py (requires Playwright Chromium)."""
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1000, "height": 900})
    page.set_content('<main class="composer-wrap"><section class="question-dock" id="dock"></section></main>')
    for name in ['style.css', 'question.css']:
        page.add_style_tag(content=(root / 'public' / name).read_text(encoding='utf-8'))
    # question.js 现在 import ./icons.js，整段拼进普通 <script> 会报「import outside a module」。
    # 这里把被依赖的模块源码先拼在前面、再去掉 import/export 关键字，维持无服务器的纯样式验收。
    icons = (root / 'public/icons.js').read_text(encoding='utf-8')
    source = (root / 'public/question.js').read_text(encoding='utf-8')
    source = icons.replace('export ', '') + '\n' + source.replace('import { actionIconNode } from "./icons.js";', '').replace('export function', 'function')
    page.add_script_tag(content=source + '''
      window.ui = createQuestionUI({root:document.querySelector('#dock'),reply:async()=>{}});
      window.request = {toolCallId:'q',questions:[
        {header:'方式',question:'请选择方式',options:[{label:'A'}]},
        {header:'功能',question:'请选择功能',options:[{label:'B'}]}
      ]};
      ui.show('s',[request]);
    ''')
    input = page.locator('textarea')
    text = ('中文换行测试\n' * 24) + ('longword' * 70)
    input.fill(text)
    def fits():
        assert input.evaluate('(e)=>e.scrollHeight <= e.clientHeight + 1'), 'textarea clips lines'
        assert input.evaluate('(e)=>e.scrollWidth <= e.clientWidth + 1'), 'textarea overflows horizontally'
    fits()
    assert input.bounding_box()['height'] > 240, 'global max-height leaked'
    height = page.locator('.question-panel').bounding_box()['height']
    page.locator('.question-tab').nth(1).click()
    assert abs(page.locator('.question-panel').bounding_box()['height'] - height) < 1
    page.locator('.question-tab').nth(0).click()
    assert input.input_value() == text
    fits()
    input.focus()
    page.evaluate('document.querySelector("textarea").setSelectionRange(3, 9)')
    page.set_viewport_size({'width': 375, 'height': 800})
    page.wait_for_timeout(100)
    fits()
    assert input.evaluate('(e)=>document.activeElement===e && e.selectionStart===3 && e.selectionEnd===9')
    input.fill('短答案')
    assert input.bounding_box()['height'] < 60
    page.evaluate("ui.show('other',[]); ui.show('s',[request])")
    assert input.input_value() == '短答案'
    fits()
    browser.close()
print('PASS: multiline, long words, tab height, resize focus/selection, shrink, session draft')
