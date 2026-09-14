"""Run against isolated tests/model-selection-preview.mjs (PREVIEW_PORT=4347)."""
import os
from playwright.sync_api import sync_playwright, expect

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.goto(os.environ.get("PREVIEW_URL", "http://127.0.0.1:4347"))
    page.locator("#open-settings").click()
    field = page.locator("#create-retry input").first
    field.fill("retry-ui-check")
    field.press("Enter")
    expect(page.locator("#create-feedback")).to_contain_text("已保存到本机")
    chip = page.locator("#create-retry .retry-chip > span")
    expect(chip).to_have_text(["retry-ui-check"])
    page.get_by_role("button", name="关闭设置", exact=True).click()
    page.locator("#open-settings").click()
    expect(chip).to_have_text(["retry-ui-check"])
    field.fill("RETRY-UI-CHECK")
    field.press("Enter")
    expect(chip).to_have_text(["retry-ui-check"])
    page.reload()
    page.locator("#open-settings").click()
    expect(chip).to_have_text(["retry-ui-check"])
    page.locator("#create-retry .retry-chip button").click()
    expect(page.locator("#create-feedback")).to_contain_text("已保存到本机")
    expect(chip).to_have_count(0)
    browser.close()
    print("PASS: Enter -> save -> reopen -> duplicate -> reload -> delete")
