"""Optional real Chromium acceptance; run model-selection-preview.mjs first."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

URL = os.environ.get("AXIOM_PREVIEW_URL", "http://127.0.0.1:4337")
ARTIFACTS = Path(os.environ.get("AXIOM_UI_ARTIFACTS", "artifacts/model-selection"))
ARTIFACTS.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(viewport={"width": 1440, "height": 1000})
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(URL)
    page.wait_for_selector("#workspace:not([hidden])")
    page.wait_for_selector(".composer-model-trigger:enabled")
    current = page.locator(".composer-model-trigger").inner_text()
    page.locator(".composer-model-trigger").click()
    menu = page.get_by_role('dialog', name='模型配置', exact=True)
    star = menu.locator('.composer-favorite[data-favorite-key="openai"]')
    was_favorite = star.get_attribute("aria-pressed") == "true"
    star.click()
    expect(star).to_have_attribute('aria-pressed', str(not was_favorite).lower())
    assert page.locator(".composer-model-trigger").inner_text() == current
    assert menu.is_visible()
    page.screenshot(path=str(ARTIFACTS / "favorites.png"))
    other = context.new_page()
    other.goto(URL)
    other.wait_for_selector(".composer-model-trigger:enabled")
    other.locator(".composer-model-trigger").click()
    expect(other.locator('.composer-favorite[data-favorite-key="openai"]')).to_have_attribute('aria-pressed', str(not was_favorite).lower())
    other.close()
    page.keyboard.press("Escape")
    assert page.locator("#provider").get_attribute("data-model-kind") == "provider"
    page.locator("#open-settings").click()
    page.wait_for_selector("#create-main-provider")
    assert page.locator("select[data-model-kind]").count() >= 13
    page.locator("#settings-models-tab").click()
    page.wait_for_timeout(500)
    page.screenshot(path=str(ARTIFACTS / "models-desktop.png"))
    assert page.locator("#models-panel").is_visible()
    assert not page.locator("#defaults-panel").is_visible()
    assert page.locator("#models-panel").inner_text().strip()
    page.locator("#settings-defaults-tab").click()
    assert page.locator("#defaults-panel").is_visible()
    page.keyboard.press("Escape")
    for width in [390, 320]:
        page.set_viewport_size({"width": width, "height": 844})
        page.wait_for_timeout(200)
        if page.locator("#sidebar-backdrop").is_visible():
            page.locator("#sidebar-backdrop").click()
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        page.screenshot(path=str(ARTIFACTS / f"composer-{width}.png"))
    assert not errors, errors
    browser.close()
print(f"Browser checks passed; screenshots: {ARTIFACTS}")
