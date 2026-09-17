"""Run: python tests/git-log-ui.py (Playwright Chromium)."""
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.set_content('<main class="markdown" style="max-width:680px;margin:auto"></main>')
    page.add_style_tag(path=str(root / 'public/style.css'))
    page.add_script_tag(path=str(root / 'node_modules/marked/lib/marked.umd.js'))
    page.add_script_tag(path=str(root / 'node_modules/dompurify/dist/purify.js'))
    source = (root / 'public/markdown.js').read_text(encoding='utf-8')
    source = '\n'.join(line for line in source.splitlines() if not line.startswith('import '))
    page.add_script_tag(content=source.replace('export function', 'function'))
    subject = '恢复历史重排修复并移除会话标签栏 ' * 10 + 'long-unbroken-subject-' * 20
    samples = [
        f'189730d merge: {subject}\n├─ 3faddf1 chore: regenerate codebase index\n└─ 4e2e2f1 docs: record duplicate-order adaptation',
        f'*   189730d merge: {subject}\n|\\\n| * 3faddf1 chore: regenerate index\n|/\n* 4e2e2f1 docs: record',
    ]
    for width in [1440, 320]:
        page.set_viewport_size({'width': width, 'height': 900})
        for sample in samples:
            page.evaluate('(text) => renderMarkdown(document.querySelector("main"), text)', '```text\n' + sample + '\n```')
            assert page.locator('.git-log').count() == 1
            xs = page.locator('.git-commit .git-hash').evaluate_all('(cells) => cells.map(c => c.getBoundingClientRect().x)')
            assert max(xs) - min(xs) < .1
            assert page.locator('.git-msg').first.evaluate('(c) => c.clientHeight > 50')
            assert page.locator('.table-scroll').evaluate('(c) => c.scrollWidth <= c.clientWidth + 1'), 'optimized history must not scroll horizontally'
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            page.get_by_role('button', name='切换到原文展示', exact=True).click()
            assert page.locator('pre').is_visible()
            assert page.locator('code').inner_text() == sample + '\n'
            page.get_by_role('button', name='切换到优化展示', exact=True).click()
            assert page.locator('.git-log').is_visible()
    browser.close()
print('git history: desktop/mobile wrapping, alignment and toggles passed')
