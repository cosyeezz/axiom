"""Browser regression for activity groups; isolated preview, no model calls or user data.
Run: python tests/activity-groups-ui.py
Requires the existing Python Playwright + Chromium installation.
"""
from pathlib import Path
import subprocess
import tempfile
import time
import urllib.request
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
preview = (root / 'tests/conversation-preview.mjs').read_text(encoding='utf-8')
preview = preview.replace('../src/server.js', (root / 'src/server.js').as_uri()).replace('4321', '4328')
preview = preview.replace('const sessions = {', 'const sessions = { listPresets: () => [],')
server = subprocess.Popen(['node', '--input-type=module', '-e', preview], cwd=root,
                          stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
artifacts = Path(tempfile.mkdtemp(prefix='axiom-activity-ui-'))
try:
    for _ in range(60):
        try:
            urllib.request.urlopen('http://127.0.0.1:4328/health', timeout=1)
            break
        except OSError:
            time.sleep(.1)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        page = browser.new_page(viewport={'width': 1440, 'height': 1000})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        # Only the isolated browser gets this test hook, not the shipped app.
        source = (root / 'public/app.js').read_text(encoding='utf-8')
        page.route('**/app.js', lambda route: route.fulfill(
            body=source + '\nwindow.activityTestEvent = event;\n', content_type='text/javascript'))
        page.add_init_script("localStorage.setItem('axiom.session', 'ui-waiting')")
        page.goto('http://127.0.0.1:4328')
        page.wait_for_selector('#workspace:not([hidden])')
        page.wait_for_function("typeof window.activityTestEvent === 'function'")
        page.wait_for_timeout(250)

        def send(kind, data):
            page.evaluate('(m) => activityTestEvent(m)', {
                'sessionId': 'ui-waiting', 'agentId': 'main', 'type': kind, 'data': data})
            page.wait_for_timeout(100)

        def groups():
            return page.locator('#output .call-group').evaluate_all('''nodes => nodes.filter(n => !n.hidden).map(n => ({
                open:n.open, active:n.dataset.active, label:n.querySelector('summary').innerText,
                folded:n.dataset.messageFolded, tools:n.querySelectorAll('.tool-record').length
            }))''')

        def shot(name):
            page.screenshot(path=str(artifacts / (name + '.png')), full_page=True)

        send('agent.message.start', {'message': {'role': 'assistant'}})
        send('agent.delta', {'type': 'thinking_delta', 'delta': '先检查文件，再修改。'})
        assert page.locator('#output .thinking-record').last.get_attribute('open') is not None
        send('agent.message.end', {'message': {'role': 'assistant', 'content': [
            {'type': 'thinking', 'thinking': '先检查文件，再修改。'},
            {'type': 'toolCall', 'id': 'a', 'name': 'read', 'arguments': {'path': 'example.txt'}}]}})
        send('tool.state', {'phase': 'end', 'toolCallId': 'a', 'toolName': 'read', 'result': {'content': []}})
        assert len(groups()) == 1 and groups()[0]['open'], groups()
        shot('01-tool-gap')
        send('agent.message.start', {'message': {'role': 'assistant'}})
        send('agent.delta', {'type': 'text_delta', 'delta': '读取完成，接下来执行修改。'})
        shot('02-prose-boundary')
        assert page.locator('#output .thinking-record').last.evaluate('''el => {
            const article = el.closest('.message');
            const text = [...article.children].find(n => n.classList.contains('markdown'));
            return !!(el.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING);
        }'''), 'thinking must precede its answer'
        assert all(not g['open'] and g['active'] == 'false' for g in groups()), groups()
        send('agent.message.end', {'message': {'role': 'assistant', 'content': [
            {'type': 'text', 'text': '读取完成，接下来执行修改。'},
            {'type': 'toolCall', 'id': 'b', 'name': 'bash', 'arguments': {'command': 'example'}}]}})
        send('tool.state', {'phase': 'end', 'toolCallId': 'b', 'toolName': 'bash', 'isError': True, 'result': {'content': []}})
        shot('03-next-tools')
        assert groups()[-1]['open'] and groups()[-1]['label'] == 'Working', groups()
        before = len(groups())
        send('agent.message.start', {'message': {'role': 'assistant'}})
        send('agent.message.end', {'message': {'role': 'assistant', 'provider': 'preview', 'model': 'axiom',
            'usage': {'input': 100, 'output': 20}, 'content': [
                {'type': 'toolCall', 'id': 'c', 'name': 'read', 'arguments': {'path': 'second.txt'}}]}})
        send('tool.state', {'phase': 'end', 'toolCallId': 'c', 'toolName': 'read', 'result': {'content': []}})
        assert len(groups()) == before, 'usage and consecutive tool messages must not split the group'
        assert groups()[-1]['label'] == 'Working' and groups()[-1]['open'], groups()
        assert 'FAILED' not in groups()[-1]['label'], groups()
        assert page.locator('.tool-activity[data-state="failed"] .tool-status').inner_text() == 'FAILED'
        send('agent.message.start', {'message': {'role': 'assistant'}})
        send('agent.delta', {'type': 'text_delta', 'delta': '已经完成。'})
        shot('04-final-prose')
        assert all(not g['open'] and g['active'] == 'false' for g in groups()), groups()
        page.locator('#output .call-group > summary').first.click()
        send('agent.delta', {'type': 'text_delta', 'delta': '请查看结果。'})
        assert groups()[0]['open'], groups()
        send('agent.message.end', {'message': {'role': 'assistant', 'content': [
            {'type': 'text', 'text': '已经完成。请查看结果。'}]}})
        send('agent.message.start', {'message': {'role': 'assistant'}})
        send('agent.delta', {'type': 'thinking_delta', 'delta': '这是回答前的思考。'})
        send('agent.delta', {'type': 'text_delta', 'delta': '这是最终回答。'})
        send('agent.message.end', {'message': {'role': 'assistant', 'content': [
            {'type': 'thinking', 'thinking': '这是回答前的思考。'},
            {'type': 'text', 'text': '这是最终回答。'}]}})
        assert page.locator('#output .thinking-record').last.evaluate('''el => {
            const group = el.closest('.call-group');
            const text = group.nextElementSibling;
            return !group.open && group.dataset.active === 'false' &&
                text.classList.contains('markdown') && text.innerText.includes('这是最终回答。');
        }'''), 'same-message thinking must be collapsed before the final answer'
        shot('05-thinking-before-answer')
        send('agent.message.start', {'message': {'role': 'assistant'}})
        send('agent.message.end', {'message': {'role': 'assistant', 'provider': 'oa173',
            'model': 'gpt-6-astra', 'thinkingLevel': 'medium', 'usage': {'input': 113494, 'output': 1234},
            'content': [{'type': 'text', 'text': '元信息展示示例。'}]}})
        meta = page.locator('#output .message-model').last
        assert meta.inner_text() == 'oa173 · gpt-6-astra · medium113,494↑1,234↓' or (
            'oa173 · gpt-6-astra · medium' in meta.inner_text() and '113,494↑' in meta.inner_text() and '1,234↓' in meta.inner_text())
        assert meta.locator('.message-tokens span').first.get_attribute('title') == '输入 tokens'
        page.set_viewport_size({'width': 390, 'height': 844})
        assert meta.evaluate('(el) => el.scrollWidth <= el.clientWidth'), 'metadata must fit mobile width'
        shot('06-message-metadata-mobile')
        assert not errors, errors
        print('PASS: tool gap, thinking expansion, prose boundaries, nested groups, failure row, manual reopen')
        print('Screenshots:', artifacts)
        browser.close()
finally:
    server.terminate()
    server.wait(timeout=10)
