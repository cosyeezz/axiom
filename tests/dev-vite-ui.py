"""隔离真实浏览器：CSS 更新不刷新，JS/HTML 自动刷新暂停；不访问真实模型。"""
import importlib.util
import subprocess
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

spec = importlib.util.spec_from_file_location("regions", Path(__file__).with_name("frontend-regions-ui.py"))
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)
r.ARTIFACTS.mkdir(parents=True, exist_ok=True)
backend, log, backend_url = r.start_preview()
port = r.free_port()
css = r.REPO / "public/style.css"
js = r.REPO / "public/app.js"
original_css, original_js = css.read_bytes(), js.read_bytes()
vite_log = (r.ARTIFACTS / "vite.log").open("w", encoding="utf-8")
vite = subprocess.Popen(["node", "--input-type=module", "-e", f"import {{ startDevWeb }} from './scripts/dev-vite.mjs'; await startDevWeb({{port:{port},backendPort:{backend_url.rsplit(':',1)[1]}}});"], cwd=r.REPO, stdout=vite_log, stderr=subprocess.STDOUT)
try:
    time.sleep(3)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(f"http://127.0.0.1:{port}")
        page.wait_for_selector("#model:enabled")
        page.locator("#prompt").fill("开发刷新保护草稿")
        page.evaluate("window.__samePage = 'retained'")
        before = page.evaluate("fetch('/health').then(r => r.json())")
        css.write_bytes(original_css + b"\n:root { --axiom-dev-probe: updated; }\n")
        page.wait_for_function("() => getComputedStyle(document.documentElement).getPropertyValue('--axiom-dev-probe').trim() === 'updated'")
        assert page.evaluate("window.__samePage") == "retained"
        assert page.locator("#prompt").input_value() == "开发刷新保护草稿"
        js.write_bytes(original_js + b"\n// dev browser reload probe\n")
        page.wait_for_timeout(1500)
        assert page.evaluate("window.__samePage") == "retained"
        assert page.locator("#prompt").input_value() == "开发刷新保护草稿"
        assert before == page.evaluate("fetch('/health').then(r => r.json())")
        assert not errors, errors
        browser.close()
    print("PASS CSS 热替换保留页面与草稿；JS 自动刷新暂停；后端健康身份不变；无页面脚本异常")
finally:
    css.write_bytes(original_css)
    js.write_bytes(original_js)
    vite.terminate(); vite.wait(timeout=15)
    backend.terminate(); backend.wait(timeout=15)
    vite_log.close(); log.close()
