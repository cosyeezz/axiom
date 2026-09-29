"""Real Chromium ClipboardEvent + production CSP/WS regression (not OS clipboard access)."""
import json
import re
import subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
server = subprocess.Popen(["node", "tests/image-input-preview.mjs"], cwd=ROOT,
                          stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                          text=True, encoding="utf-8")
try:
    url = server.stdout.readline().strip()
    assert re.fullmatch(r"http://127\.0\.0\.1:\d+", url), url
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            for blocked in (False, True):
                context = browser.new_context(extra_http_headers={"x-fixture-block-worker": "true"} if blocked else {})
                page = context.new_page()
                sent, responses, workers, errors = [], [], [], []
                page.on("worker", lambda worker: workers.append(worker.url))
                page.on("pageerror", lambda error: errors.append(str(error)))
                page.on("console", lambda message: errors.append(message.text) if message.type == 'error' else None)

                def socket_open(ws):
                    ws.on("framesent", lambda raw: sent.append(json.loads(raw)))
                    ws.on("framereceived", lambda raw: responses.append(json.loads(raw)))
                page.on("websocket", socket_open)
                response = page.goto(url + "/")
                expected_policy = "worker-src 'none'" if blocked else "worker-src 'self' blob:"
                assert expected_policy in response.headers["content-security-policy"]
                try:
                    page.wait_for_function("() => !document.querySelector('#add-image').disabled")
                except Exception:
                    print(json.dumps({"errors": errors, "responses": responses, "ui_error": page.locator('#error').text_content()}, ensure_ascii=True))
                    raise
                size = page.evaluate("""async () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = canvas.height = 700;
                    const ctx = canvas.getContext('2d'), pixels = ctx.createImageData(700, 700);
                    for (let offset = 0; offset < pixels.data.length; offset += 65536)
                      crypto.getRandomValues(pixels.data.subarray(offset, Math.min(offset + 65536, pixels.data.length)));
                    ctx.putImageData(pixels, 0, 0);
                    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                    const input = document.querySelector('#prompt'); input.focus();
                    for (let n = 1; n <= 2; n++) {
                      const transfer = new DataTransfer();
                      transfer.items.add(new File([blob], `${n}.png`, {type: 'image/png'}));
                      input.dispatchEvent(new ClipboardEvent('paste', {bubbles: true, cancelable: true, clipboardData: transfer}));
                    }
                    return blob.size;
                }""")
                assert 800000 < size <= 5 * 1024 * 1024, size
                page.wait_for_function("() => document.querySelectorAll('#image-attachments img').length === 2 && !document.querySelector('#send').disabled")
                assert page.locator("#prompt").input_value() == "[image1][image2]"
                page.locator("#prompt").press("Enter")
                for _ in range(300):
                    page.wait_for_timeout(50)
                    prompts = [item for item in sent if item.get("type") == "prompt"]
                    if prompts and any(item.get("type") == "response" and item.get("id") == prompts[0]["id"] for item in responses):
                        break
                assert len(prompts) == 1, len(prompts)
                prompt = prompts[0]
                assert len(prompt["images"]) == 2
                assert all(len(image["data"]) > 1 << 20 for image in prompt["images"])
                assert next(item for item in responses if item.get("type") == "response" and item.get("id") == prompt["id"])["ok"]
                page.wait_for_function("() => document.querySelector('#image-attachments').hidden")
                page.locator("#prompt").fill("small follow-up")
                page.locator("#prompt").press("Enter")
                for _ in range(100):
                    page.wait_for_timeout(50)
                    followup = [item for item in sent if item.get("type") == "prompt" and item.get("text") == "small follow-up"]
                    if followup and any(item.get("type") == "response" and item.get("id") == followup[0]["id"] for item in responses):
                        break
                assert len(followup) == 1
                assert next(item for item in responses if item.get("type") == "response" and item.get("id") == followup[0]["id"])["ok"]
                assert len([item for item in sent if item.get('type') == 'prompt']) == 2
                if blocked:
                    assert not workers, workers
                else:
                    assert any(worker.startswith("blob:") for worker in workers), workers
                    assert not errors, errors
                print(json.dumps({"worker_blocked": blocked, "png_bytes": size,
                                  "prompt_count": len([item for item in sent if item.get('type') == 'prompt']),
                                  "worker_count": len(workers), "status": "passed"}))
                context.close()
        finally:
            browser.close()
finally:
    server.stdin.close()
    try:
        server.wait(timeout=15)
    except subprocess.TimeoutExpired:
        server.terminate()
        server.wait(timeout=10)
    assert server.returncode == 0, server.returncode
