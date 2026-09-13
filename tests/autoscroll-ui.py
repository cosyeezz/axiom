"""Visual regression: run conversation-preview.mjs, then python tests/autoscroll-ui.py.
Requires an existing Playwright Python + Chromium installation; no live model or user data.
覆盖：运行中内容增高自动吸底、用户上滚暂停、滚回最底部恢复、无用户意图的补发滚动事件不暂停跟随。
"""
import sys
from playwright.sync_api import sync_playwright

URL = f"http://127.0.0.1:{__import__('os').environ.get('PREVIEW_PORT', '4321')}"
sys.stdout.reconfigure(encoding="utf-8")
fails = []


def check(name, condition, detail=""):
    print(("PASS " if condition else "FAIL ") + name + ("" if condition else f" -> {detail}"))
    if not condition:
        fails.append(name)


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1280, "height": 720})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL)
    page.evaluate('() => localStorage.setItem("axiom.session", "ui-long")')
    page.reload()
    page.wait_for_selector("#workspace:not([hidden])")
    page.wait_for_timeout(600)

    def state():
        return page.evaluate("""() => {
            const el = document.getElementById('transcript');
            return {
                top: el.scrollTop,
                gap: el.scrollHeight - el.scrollTop - el.clientHeight,
                latestHidden: document.getElementById('latest').hidden,
            };
        }""")

    def grow(pixels):
        # 直接追加内容：不经过 scrollLatest，验证吸底不依赖调用点。
        page.evaluate("""(px) => {
            const filler = document.createElement('div');
            filler.style.height = px + 'px';
            document.getElementById('output').append(filler);
        }""", pixels)

    start = state()
    check("长会话初始贴底", start["gap"] < 2, str(start))
    check("贴底时隐藏「回到最新」", start["latestHidden"] is True, str(start))

    grow(600)
    page.wait_for_timeout(300)
    grown = state()
    check("内容增高自动继续贴底", grown["gap"] < 2, str(grown))
    check("增高后仍隐藏「回到最新」", grown["latestHidden"] is True, str(grown))

    page.mouse.move(640, 300)
    page.mouse.wheel(0, -900)
    page.wait_for_timeout(300)
    scrolled = state()
    check("用户上滚后离开底部", scrolled["gap"] > 80, str(scrolled))
    check("上滚后显示「回到最新」", scrolled["latestHidden"] is False, str(scrolled))

    grow(600)
    page.wait_for_timeout(300)
    paused = state()
    check("暂停期间不抢走阅读位置", abs(paused["top"] - scrolled["top"]) < 2, f"{scrolled} {paused}")
    check("暂停期间保持「回到最新」", paused["latestHidden"] is False, str(paused))

    page.evaluate("() => { const el = document.getElementById('transcript'); el.scrollTop = el.scrollHeight; }")
    page.wait_for_timeout(300)
    resumed = state()
    check("滚回最底部自动恢复吸底", resumed["gap"] < 2, str(resumed))
    check("恢复后隐藏「回到最新」", resumed["latestHidden"] is True, str(resumed))

    grow(400)
    page.wait_for_timeout(300)
    check("恢复后继续跟随新内容", state()["gap"] < 2, str(state()))

    # 补底的滚动事件要等下一帧才派发，届时内容已被撑高，不能据此判成“用户离开底部”。
    page.evaluate("""() => {
        const el = document.getElementById('transcript');
        el.scrollTop = el.scrollHeight;
        const filler = document.createElement('div');
        filler.style.height = '300px';
        document.getElementById('output').append(filler);
        el.dispatchEvent(new Event('scroll'));
    }""")
    page.wait_for_timeout(300)
    stale = state()
    check("补发滚动事件不暂停吸底", stale["gap"] < 2 and stale["latestHidden"] is True, str(stale))

    check("页面无脚本错误", not errors, "; ".join(errors))
    browser.close()

print("FAILED: " + ", ".join(fails) if fails else "ALL PASS")
sys.exit(1 if fails else 0)
