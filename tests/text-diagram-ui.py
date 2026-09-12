"""Run: python tests/text-diagram-ui.py (requires Playwright Chromium)."""
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.set_content('<main class="markdown"></main>')
    page.add_style_tag(path=str(root / 'public/style.css'))
    page.add_script_tag(path=str(root / 'node_modules/marked/lib/marked.umd.js'))
    page.add_script_tag(path=str(root / 'node_modules/dompurify/dist/purify.js'))
    source = (root / 'public/markdown.js').read_text(encoding='utf-8')
    source = '\n'.join(line for line in source.splitlines() if not line.startswith('import '))
    page.add_script_tag(content=source.replace('export function', 'function'))
    sample = '```text\n┌────────────┐    ┌────────────┐\n│ ✓ 完成     │    │ ✎ 重命名   │\n│ 中文 😀    │    │ JSONL 路径 │\n└────────────┘    └────────────┘\n```'
    for width in [1440, 320]:
        page.set_viewport_size({'width': width, 'height': 700})
        page.evaluate('(text) => renderMarkdown(document.querySelector("main"), text)', sample)
        assert page.locator('.text-diagram').count() == 1
        sizes = page.locator('.diagram-cell').evaluate_all('(cells) => cells.map(c => ({wide:c.classList.contains("diagram-wide"), width:c.getBoundingClientRect().width}))')
        unit = sizes[0]['width']
        assert all(abs(c['width'] - unit * (2 if c['wide'] else 1)) < .1 for c in sizes)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        assert page.locator('pre').get_attribute('tabindex') == '0'
        page.get_by_role('button', name='切换到原文展示', exact=True).click()
        assert page.locator('.text-diagram').count() == 0
        page.get_by_role('button', name='切换到优化展示', exact=True).click()
        assert page.locator('.text-diagram').count() == 1
    page.evaluate('(text) => renderMarkdown(document.querySelector("main"), text)', '```text\n中文\tX\né\tY\n```')
    page.get_by_role('button', name='切换到优化展示', exact=True).click()
    positions = page.locator('.diagram-cell').evaluate_all('(cells) => cells.filter(c => ["X","Y"].includes(c.textContent)).map(c => c.getBoundingClientRect().x)')
    assert abs(positions[0] - positions[1]) < .1, 'tabs align to the same eight-cell stop'
    browser.close()
print('text diagram grid: desktop/mobile passed')
