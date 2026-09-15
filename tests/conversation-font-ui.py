"""Run: python tests/conversation-font-ui.py (requires Playwright Chromium)."""
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
source = (root / 'public/app.js').read_text(encoding='utf-8')
source = source[source.index('const fontScale ='):source.index('const themeColors =')]
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={'width': 1440, 'height': 900})
    page.route('http://font.test/**', lambda route: route.fulfill(body=''))
    page.route('http://font.test/', lambda route: route.fulfill(body=(root / 'public/index.html').read_text(encoding='utf-8'), content_type='text/html'))
    page.goto('http://font.test/')
    for css in ['style', 'goal']:
        page.add_style_tag(path=str(root / f'public/{css}.css'))
    page.evaluate('''() => {
      document.querySelector('#workspace').hidden = false;
      document.querySelector('#output').innerHTML = `<article class="message"><h3>用户</h3><div class="markdown"><p>会话正文</p><h1>标题</h1><h2>二级</h2><h3>三级</h3><pre><code>code</code></pre><p><code>inline</code></p><table><tr><td>表格</td></tr></table></div><div class="thinking-content markdown"><h1>思考</h1></div><div class="tool-detail"><pre>工具结果</pre></div><div class="call-group"><summary><span class="activity-line">工具记录</span></summary></div></article>`;
      const task = document.createElement('div'); task.className = 'task-body';
      task.innerHTML = '<div class="markdown">子代理</div>'; document.body.append(task);
    }''')
    page.add_script_tag(content='const $ = (id) => document.getElementById(id);\n' + source)
    selectors = ['#output .markdown', '#output .markdown h1', '#output .markdown h2', '#output .markdown h3', '#output pre code', '#output p code', '#output td', '.thinking-content h1', '.tool-detail pre', '.activity-line', '.task-body .markdown']
    unchanged = ['#sidebar', '#prompt', '#conversation-font-scale', '.header-title h1']
    def sizes(items):
        return [page.locator(s).first.evaluate('(el) => parseFloat(getComputedStyle(el).fontSize)') for s in items]
    baseline, chrome = sizes(selectors), sizes(unchanged)
    for scale in [125, 150, 175, 200, 100]:
        page.select_option('#conversation-font-scale', str(scale))
        assert all(abs(actual - original * scale / 100) < .02 for actual, original in zip(sizes(selectors), baseline))
        assert sizes(unchanged) == chrome, 'sidebar, composer and header must not scale'
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.select_option('#conversation-font-scale', '150')
    page.add_script_tag(content='(() => {' + source + '})();')
    assert page.locator('#conversation-font-scale').input_value() == '150', 'saved selection restored'
    page.set_viewport_size({'width': 390, 'height': 844})
    assert not page.locator('#conversation-font-scale').is_visible()
    mobile = sizes(selectors)
    page.evaluate('applyConversationFontScale("100")')
    assert sizes(selectors) == mobile, 'desktop preference must not change mobile typography'
    browser.close()
print('conversation font: scaling, isolation, persistence and mobile passed')
