"""Run conversation-preview.mjs, then python tests/compaction-ui.py [artifact-dir].
Uses installed Playwright/Chromium; no model calls or user history.
"""
from pathlib import Path
import sys
from playwright.sync_api import sync_playwright, expect

out = Path(sys.argv[1]) if len(sys.argv) > 1 else None
if out:
    out.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    for width in [1440, 390, 320]:
        page.set_viewport_size({"width": width, "height": 1000 if width == 1440 else 844})
        page.goto("http://127.0.0.1:4321/#session=ui-compaction")
        page.wait_for_selector("#workspace:not([hidden])")
        page.wait_for_timeout(150)
        expect(page.locator("#session-title")).to_have_text("压缩验收 · 摘要分层与后台进度")
        if width < 768 and page.locator("#mobile-expand").get_attribute("aria-expanded") != "true":
            page.locator("#mobile-expand").click()
        progress = page.locator("#compaction-progress")
        expect(progress).to_be_visible()
        assert progress.get_attribute("role") == "status"
        assert progress.bounding_box()["y"] < page.locator("#prompt").bounding_box()["y"]
        cards = page.locator("#output > .compaction-card")
        expect(cards).to_have_count(2)
        expect(page.locator("#output > .task-card")).to_have_count(0)
        assert page.locator("#output").evaluate("el => [...el.children].filter(n => !n.hidden).slice(0, 2).every(n => n.classList.contains('compaction-card'))")
        for i in range(2):
            card = cards.nth(i)
            card.locator(":scope > summary").click()
            task = card.locator(".task-card")
            expect(task).to_have_count(1)
            expect(task).to_be_visible()
            task.click()
            expect(page.locator(".task-dialog[open]")).to_be_visible()
            expect(page.locator(".task-dialog[open] .task-body")).to_contain_text("子代理原始结果")
            page.keyboard.press("Escape")
            card.locator(":scope > summary").click()
        spinner = progress.locator(".task-run-spin")
        before = spinner.evaluate("el => getComputedStyle(el).transform")
        page.wait_for_timeout(120)
        assert spinner.evaluate("el => getComputedStyle(el).transform") != before
        page.emulate_media(reduced_motion="reduce")
        assert spinner.evaluate("el => getComputedStyle(el).animationName") == "none"
        page.emulate_media(reduced_motion="no-preference")
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        if out:
            page.screenshot(path=str(out / f"compaction-{width}.png"))
    assert not errors, errors
    browser.close()
print("compaction UI: desktop/390/320px, nested task dialogs, status, reduced-motion passed")
