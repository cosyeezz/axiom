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
preview = preview.replace('const sessions = {', '''
const activityHistory = { ...state, sessionId: 'ui-activity-history', tasks: [], messages: [
  { agentId: 'main', message: { role: 'user', content: '开始检查。' } },
  ...['one', 'two', 'three'].flatMap(id => [
    { agentId: 'main', message: assistant([{ type: 'thinking', thinking: `检查 ${id}` },
      { type: 'toolCall', id, name: 'read', arguments: { path: `${id}.txt` } }]) },
    { agentId: 'main', message: { role: 'toolResult', toolCallId: id, toolName: 'read', content: [] } },
  ]),
  { agentId: 'main', message: assistant([{ type: 'thinking', thinking: '汇总检查结果。' },
    { type: 'text', text: '检查已完成。' }]) },
] };
states.push(activityHistory);
const sessions = { listPresets: () => [],''')
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
        send('agent.message.start', {'message': {'role': 'assistant'}})
        send('agent.message.end', {'message': {'role': 'assistant', 'provider': 'preview', 'model': 'axiom',
            'usage': {'input': 200, 'output': 30}, 'content': [
                {'type': 'toolCall', 'id': 'd', 'name': 'read', 'arguments': {'path': 'third.txt'}}]}})
        send('tool.state', {'phase': 'end', 'toolCallId': 'd', 'toolName': 'read', 'result': {'content': []}})
        assert len(groups()) == before and groups()[-1]['tools'] == 3, 'three consecutive calls must share one group'
        assert groups()[-1]['label'] == 'Working' and groups()[-1]['open'], groups()
        assert 'FAILED' not in groups()[-1]['label'], groups()
        assert page.locator('.tool-activity[data-state="failed"] .tool-status').inner_text() == 'FAILED'
        send('agent.message.start', {'message': {'role': 'assistant'}})
        send('agent.delta', {'type': 'thinking_delta', 'delta': '整理刚才的工具结果。'})
        send('agent.delta', {'type': 'text_delta', 'delta': '已经完成。'})
        assert len(groups()) == before, 'answer thinking must merge with preceding tools, not create another Completed'
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
        page.locator('#output').evaluate("el => { const p = document.createElement('p'); p.textContent = '滚动验证。'.repeat(2000); el.append(p); }")
        page.locator('#transcript').evaluate('el => el.scrollTop = el.scrollHeight')
        page.wait_for_timeout(150)
        page.locator('#earliest').click()
        assert page.locator('#transcript').evaluate('el => el.scrollTop') == 0
        assert page.locator('#latest').is_visible()
        page.locator('#latest').click()
        page.wait_for_timeout(150)
        assert page.locator('#transcript').evaluate('el => el.scrollHeight - el.clientHeight - el.scrollTop < 2')
        send('agent.message.start', {'message': {'role': 'assistant'}})
        send('agent.delta', {'type': 'thinking_delta', 'delta': '第一段思考。'})
        send('agent.delta', {'type': 'text_delta', 'delta': '第一段正文。'})
        send('agent.delta', {'type': 'text_delta', 'delta': '继续第二段。'})
        send('agent.delta', {'type': 'text_delta', 'delta': '继续第三段。'})
        send('agent.message.end', {'message': {'role': 'assistant', 'content': [
            {'type': 'thinking', 'thinking': '第一段思考。'}, {'type': 'text', 'text': '第一段正文。'}]}})
        send('agent.message.start', {'message': {'role': 'assistant'}})
        send('agent.delta', {'type': 'thinking_delta', 'delta': '第二段思考。'})
        send('agent.delta', {'type': 'text_delta', 'delta': '第二段正文。'})
        send('agent.message.end', {'message': {'role': 'assistant', 'content': [
            {'type': 'thinking', 'thinking': '第二段思考。'}, {'type': 'text', 'text': '第二段正文。'}]}})
        send('agent.message.start', {'message': {'role': 'assistant'}})
        send('agent.delta', {'type': 'text_delta', 'delta': '第三段正文。'})
        send('agent.message.end', {'message': {'role': 'assistant', 'content': [{'type': 'text', 'text': '第三段正文。'}]}})
        completed = [g for g in groups() if g['label'] == 'Completed'][1:]
        assert len(completed) >= 2 and all(not g['open'] for g in completed), groups()
        adjacent = page.locator('#output').evaluate('''() => {
            const rows = [...document.querySelectorAll('#output .call-group, #output .message > .markdown')]
                .filter(n => !n.closest('[hidden], .call-list') &&
                    (n.classList.contains('call-group') || n.textContent.trim()));
            for (let i = 1; i < rows.length; i++)
                if (rows[i].classList.contains('call-group') && rows[i - 1].classList.contains('call-group')) return true;
            return false;
        }''')
        assert not adjacent, 'folded rows must be separated by prose'
        assert not any(g['active'] == 'true' for g in groups()), groups()
        shot('07-three-prose-segments')
        # Real attach + reload: three tool/usage/thinking messages form one segment.
        page.goto('http://127.0.0.1:4328/#session=ui-activity-history')
        page.reload()
        page.wait_for_function("document.querySelector('#output').textContent.includes('检查已完成。')")
        page.wait_for_timeout(250)
        for attempt in range(2):
            assert len(groups()) == 1 and groups()[0]['tools'] == 3, groups()
            assert groups()[0]['label'] == 'Completed' and not groups()[0]['open'], groups()
            assert page.locator('#output .thinking-record').last.evaluate('''el =>
                !!(el.compareDocumentPosition(document.querySelector('#output > .message:last-child')) &
                   Node.DOCUMENT_POSITION_FOLLOWING)'''), 'restored thinking must precede answer'
            if attempt == 0:
                page.reload()
                page.wait_for_function("document.querySelector('#output').textContent.includes('检查已完成。')")
                page.wait_for_timeout(250)
        shot('08-history-reload')
        assert not errors, errors
        print('PASS: tool gap, thinking order, prose boundaries, failure row, manual reopen, mobile metadata, scroll jumps, three-call history and reload')
        print('Screenshots:', artifacts)
        browser.close()
finally:
    server.terminate()
    server.wait(timeout=10)
