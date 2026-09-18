"""Run: python tests/context-menu-ui.py (requires Playwright Chromium)."""
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
source = (root / "public/app.js").read_text(encoding="utf-8")
handlers = (
    'const $=id=>document.getElementById(id); '
    'const config={skills:[{name:"design".repeat(30),description:"Project skill ".repeat(50)}]}; '
    'let connected=true,changing=false,sessionId="test"; '
    'const request=()=>new Promise(()=>{}); '
    + source[source.index("function contextIcon("):source.index("function renderContextChips(")]
    + source[source.index("function fuzzyHit("):source.index('$("composer-skill").onchange =')]
)
with sync_playwright() as p:
    browser = p.chromium.launch()
    for width in [1100, 390]:
        page = browser.new_page(viewport={"width": width, "height": 780})
        page.set_content((root / "public/index.html").read_text(encoding="utf-8"))
        page.add_style_tag(content=(root / "public/style.css").read_text(encoding="utf-8"))
        page.evaluate('''() => {
            document.querySelector('.shell').classList.add('mobile-expanded');
            document.querySelector('#workspace').hidden = false;
            document.querySelector('#sidebar').remove();
            document.querySelector('#add-context').style.cssText = 'position:fixed;left:24px;top:600px;z-index:100';
        }''')
        page.add_script_tag(content=handlers)
        page.locator('#add-context').click()
        original = page.locator('#context-menu').bounding_box()
        page.locator('[data-context="skill"]').hover()
        page.wait_for_timeout(150)
        assert page.locator('#context-menu').bounding_box() == original
        assert page.locator('#context-menu').evaluate('(e)=>e.matches(":popover-open")')
        assert page.locator('#context-picker').is_visible()
        assert page.locator('[data-context="file"]').is_visible()
        category = page.locator('[data-context="skill"]').bounding_box()
        picker = page.locator('#context-picker').bounding_box()
        if width > 600:
            assert picker['x'] >= category['x'] + category['width']
        assert picker['x'] >= 0 and picker['x'] + picker['width'] <= width
        assert picker['y'] >= 0 and picker['y'] + picker['height'] <= 780
        assert page.locator('#context-results button').get_attribute('title') == 'design' * 30 + '\n' + 'Project skill ' * 50
        for selector in ['#context-results button > span > span', '#context-results small']:
            assert page.locator(selector).evaluate('''(e) => {
                const style = getComputedStyle(e);
                return style.whiteSpace === 'nowrap' && style.textOverflow === 'ellipsis'
                    && e.scrollWidth > e.clientWidth && e.clientHeight < 24;
            }''')
        for selector in ['#context-picker', '#context-results']:
            assert page.locator(selector).evaluate('(e)=>e.scrollWidth <= e.clientWidth')
        page.locator('#context-search').focus()
        page.keyboard.press('Escape')
        assert page.locator('[data-context="file"]').is_visible()
        page.locator('[data-context="skill"]').click()
        page.keyboard.press('Escape')
        assert not page.locator('#context-picker').is_visible()
        page.keyboard.press('Escape')
        assert not page.locator('#context-menu').is_visible()
        page.locator('#add-context').click()
        assert not page.locator('#context-picker').is_visible()
        page.locator('[data-context="skill"]').click()
        page.locator('#add-context').click()
        assert not page.locator('#context-menu').is_visible()
        page.close()
    browser.close()
print('Context menu: desktop/mobile, plus toggle, back, Escape, single-line ellipsis and tooltip passed')
