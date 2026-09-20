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
        # 条幅整行可点 → 后台压缩过程详情：触发事实、步骤流、流式尾部、取消按钮、历史切换
        opener = progress.locator("button.compaction-progress-open")
        expect(opener).to_be_visible()
        assert opener.get_attribute("aria-haspopup") == "dialog"
        assert opener.bounding_box()["width"] > progress.bounding_box()["width"] * 0.9, "整行都是热区"
        opener.click()
        dialog = page.locator("#compaction-run")
        expect(dialog).to_be_visible()
        expect(page.locator("#compaction-run-title")).to_contain_text("生成中")
        expect(page.locator("#compaction-run-trigger")).to_contain_text("121,500 / 200,000 tokens")
        expect(page.locator("#compaction-run-steps > li")).to_have_count(5)
        expect(page.locator("#compaction-run-stream")).to_contain_text("## Goal")
        expect(page.locator("#compaction-run-cancel")).to_be_visible()
        assert page.locator("#compaction-run-error").is_hidden()
        assert dialog.bounding_box()["width"] <= width
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        if out:
            page.screenshot(path=str(out / f"compaction-run-{width}.png"))
        # 历史记录：只换展示、露出失败原因，并且不能再取消
        page.locator("#compaction-run-pick").select_option("run-preview-1")
        expect(page.locator("#compaction-run-error")).to_have_text("429 Too Many Requests")
        assert page.locator("#compaction-run-cancel").is_hidden()
        page.keyboard.press("Escape")
        expect(dialog).to_be_hidden()
        if out:
            page.screenshot(path=str(out / f"compaction-{width}.png"))
    assert not errors, errors
    browser.close()
print("compaction UI: desktop/390/320px, nested task dialogs, status banner → run dialog, cancel, history, reduced-motion passed")
