"""Run against conversation-preview.mjs (PREVIEW_PORT=4322)."""
import os
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.goto(os.environ.get("PREVIEW_URL", "http://127.0.0.1:4322") + "/#session=ui-compaction")
    for theme in ["dark", "light"]:
        for width in [1440, 390, 320]:
            page.set_viewport_size({"width": width, "height": 900})
            page.reload()
            page.wait_for_selector("#workspace:not([hidden])")
            page.evaluate("theme => document.documentElement.dataset.theme = theme", theme)
            # Isolate modal layout from the responsive composer/navigation state.
            page.locator("#compact-session").evaluate("el => el.click()")
            dialog = page.locator("#manual-compaction")
            before = dialog.bounding_box()
            page.locator("#manual-compaction-mode").click()
            menu = page.locator(".ax-mp-menu:visible")
            assert menu.count() == 1
            assert menu.locator(".ax-mp-star").count() == 0
            menu.get_by_role("menuitemradio", name="同步 · 压缩期间暂停主会话", exact=True).click()
            assert "安全停止" in page.locator("#manual-compaction-hint").inner_text()
            after = dialog.bounding_box()
            assert abs(before["width"] - after["width"]) <= 1
            assert abs(before["height"] - after["height"]) <= 1
            assert after["x"] >= 0 and after["x"] + after["width"] <= width
            assert dialog.evaluate("el => getComputedStyle(el).borderRadius") == "16px"
            page.locator("#manual-compaction-cancel").click()
    browser.close()
print("Manual compaction: themed picker and stable dimensions passed (dark/light, 1440/390/320px).")
