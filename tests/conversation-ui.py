"""Visual regression: run conversation-preview.mjs, then python tests/conversation-ui.py [artifact-dir].
Requires an existing Playwright Python + Chromium installation; no live model or user data.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
import json
import sys

out = Path(sys.argv[1]) if len(sys.argv) > 1 else None
if out:
    out.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

    def load(id):
        page.goto(f"http://127.0.0.1:{__import__('os').environ.get('PREVIEW_PORT', '4321')}/#session={id}")
        page.wait_for_selector("#workspace:not([hidden])")
        page.wait_for_timeout(150)
        page.evaluate('(id) => localStorage.setItem("axiom.session", id)', id)
        page.reload()
        page.wait_for_selector("#workspace:not([hidden])")
        page.wait_for_timeout(150)
        assert page.evaluate('() => location.hash') == f"#session={id}"
        if page.evaluate('() => innerWidth <= 700'):
            page.locator('#mobile-expand').click()
        for group in page.locator('#output .call-group:not([open]) > summary').all():
            group.click()

    def style(el, key, pseudo=None):
        return el.evaluate('(el, args) => getComputedStyle(el, args[1])[args[0]]', [key, pseudo])

    def shot(name):
        if out:
            page.wait_for_timeout(150)
            page.screenshot(path=str(out / (name + ".png")))

    def overflow():
        assert page.evaluate('''() => document.documentElement.scrollWidth <= innerWidth &&
            [...document.querySelectorAll('#output, .task-dialog[open]')].every(el => el.scrollWidth <= el.clientWidth)''')

    def rotating(el, pseudo=None, expected_width="12px"):
        assert style(el, "animationName", pseudo) in ["activity-spin", "task-run-spin"]
        assert style(el, "animationDuration", pseudo) == "1.6s"
        assert style(el, "width", pseudo) == expected_width
        before = style(el, "transform", pseudo)
        page.wait_for_timeout(120)
        assert style(el, "transform", pseudo) != before, "spinner must actually move"
        page.emulate_media(reduced_motion="reduce")
        assert style(el, "animationName", pseudo) == "none"
        page.emulate_media(reduced_motion="no-preference")

    load("ui-review")
    page.context.grant_permissions(['clipboard-read', 'clipboard-write'])
    prompt = page.locator('#prompt')
    prompt.fill('automatic copy')
    prompt.press('Control+a')
    assert page.evaluate('navigator.clipboard.readText()') == 'automatic copy'
    paragraph = page.locator('#output .markdown p').first
    paragraph.evaluate('''el => {
        const range = document.createRange(); range.selectNodeContents(el);
        const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    }''')
    paragraph.dispatch_event('pointerup', {'button': 0})
    assert page.evaluate('navigator.clipboard.readText()') == paragraph.inner_text()
    page.locator('#open-settings').click()
    page.locator('#selection-copy').select_option('off')
    page.reload()
    page.wait_for_selector('#workspace:not([hidden])')
    assert page.locator('#selection-copy').input_value() == 'off'
    page.evaluate('navigator.clipboard.writeText("keep clipboard")')
    prompt.fill('do not copy')
    prompt.press('Control+a')
    assert page.evaluate('navigator.clipboard.readText()') == 'keep clipboard'
    paragraph = page.locator('#output .markdown p').first
    paragraph.evaluate('''el => {
        const range = document.createRange(); range.selectNodeContents(el);
        const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    }''')
    paragraph.dispatch_event('pointerup', {'button': 0})
    assert page.evaluate('navigator.clipboard.readText()') == 'keep clipboard'
    page.locator('#open-settings').click()
    page.locator('#selection-copy').select_option('on')
    page.keyboard.press('Escape')
    prompt.fill('')
    prompt.blur()  # Separate setup from the next native undo transaction.
    prompt.focus()
    page.keyboard.insert_text('undo this draft')
    page.keyboard.press('Control+z')
    expect(prompt).to_have_value('')
    page.keyboard.press('Control+Shift+z')
    expect(prompt).to_have_value('undo this draft')
    prompt.evaluate('(el) => el.setSelectionRange(0, 4)')
    page.keyboard.press('Control+c')
    expect(prompt).to_have_value('')
    expect(page.locator('#prompt-completion')).to_be_hidden()
    page.keyboard.press('Control+c')  # Empty clear must not add an undo step.
    page.keyboard.press('Control+z')
    expect(prompt).to_have_value('undo this draft')
    prompt.evaluate('''el => el.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'c', ctrlKey: true, isComposing: true, bubbles: true, cancelable: true
    }))''')
    expect(prompt).to_have_value('undo this draft')
    page.reload()

    for width in [1440, 390, 320]:
        page.set_viewport_size({"width": width, "height": 1000 if width == 1440 else 844})
        load("ui-review")
        github = page.locator('#github-link')
        github.hover()
        expect(page.locator('#ax-tooltip.ax-show')).to_be_visible()
        expect(page.locator('#ax-tooltip')).to_have_text('在 GitHub 查看源码')
        page.keyboard.press('Escape')
        assert github.get_attribute('href') == 'https://github.com/cosyeezz/axiom'
        assert github.get_attribute('target') == '_blank'
        body = page.locator('#output .message > .markdown').filter(has=page.locator('h2')).first
        assert style(body, "fontSize") == "14px"
        assert style(body.locator('strong').first, "fontWeight") == "650"
        colors = [style(page.locator(f'.tool-activity[data-tool-icon="{kind}"] .activity-icon').first, "color") for kind in ['read', 'bash', 'edit']]
        assert len(set(colors)) == 3
        for label in ['read', 'bash', 'web_search', 'edit', 'powershell']:
            row = page.locator('.tool-activity').filter(has=page.get_by_text(label, exact=True)).first
            expect(row.locator('.activity-label')).to_have_text(label)
            assert style(row.locator('.activity-label'), 'fontSize') == '12px'
            assert style(row.locator('.activity-label'), 'fontWeight') == '400'
            assert style(row.locator('.activity-icon'), 'width') == '20px'
            assert style(row.locator('.activity-icon svg'), 'width') == '14px'
        row = page.locator('.tool-record').first
        assert row.bounding_box()['height'] <= (40 if width == 1440 else 60)
        assert row.locator('summary').bounding_box()['height'] >= (36 if width == 1440 else 44)
        skill = page.locator('.skill-invocation').first
        expect(skill.locator('.skill-badge')).to_have_text('SKILL')
        expect(skill.locator('.skill-name')).to_have_text('codebase-map')
        assert style(skill, 'borderLeftWidth') == '3px'
        assert style(skill, 'backgroundColor') != style(page.locator('body'), 'backgroundColor')
        skill.locator('summary').focus()
        page.keyboard.press('Enter')
        expect(skill.locator('h2')).to_have_text('代码导航')
        page.keyboard.press('Space')
        assert not skill.evaluate('(el) => el.open')
        skill.locator('summary').blur()
        page.locator('#transcript').evaluate('(el) => el.scrollTop = 0')
        shot(f"conversation-{width}")
        thought = page.locator('#output .thinking-record:not([hidden])').first
        expect(thought.locator('.activity-label')).to_have_text('thinking')
        assert style(thought.locator('.activity-label'), 'fontSize') == '12px'
        assert style(thought.locator('.activity-label'), 'fontWeight') == '400'
        thought.locator('summary').click()
        expect(thought.locator('h3')).to_be_visible()
        for tag in ['h3', 'strong', 'p']:
            assert style(thought.locator(tag).first, "fontStyle") == "italic"
            assert style(thought.locator(tag).first, "fontWeight") == "400"
        assert style(thought.locator('code').first, "fontStyle") == "normal"
        overflow()
        page.locator('#transcript').evaluate('(el) => el.scrollTop = 0')
        shot(f"thinking-{width}")

        # Real long content: sticky summaries stay in view, inner regions do not scroll vertically.
        load('ui-long')
        for scope, scroll in [('#output', '#transcript'), ('.task-dialog', '.task-dialog[open] .task-body')]:
            if scope == '.task-dialog':
                page.locator('.task-card').click()
                for group in page.locator('.task-dialog[open] .call-group:not([open]) > summary').all():
                    group.click()
            for kind in (['.thinking-record:not([hidden])', '.tool-record'] if scope == '#output' else ['.thinking-record:not([hidden])', '.task-system-prompt']):
                record = page.locator(f'{scope if scope == "#output" else ".task-dialog[open]"} {kind}').first
                record.locator('summary').click()
                page.wait_for_timeout(750)  # Allow the interaction-deferred renderer to paint.
                record.evaluate('''(el, selector) => {
                    const scroller = document.querySelector(selector);
                    const within = Math.min(650, Math.max(1, el.getBoundingClientRect().height - 120));
                    scroller.scrollTop += el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + within;
                }''', scroll)
                page.wait_for_timeout(120)
                summary = record.locator('summary')
                scroller = page.locator(scroll)
                sticky_top = scroller.bounding_box()['y'] + float(style(scroller, 'paddingTop').removesuffix('px'))
                if scope == '#output' and width > 700:
                    assert style(summary, 'position') == 'sticky'
                    expected = sticky_top + float(style(summary, 'top').removesuffix('px'))
                    assert abs(summary.bounding_box()['y'] - expected) <= 2, (width, scope, kind, summary.bounding_box(), expected)
                else:
                    assert style(summary, 'position') == 'static'
                assert record.evaluate('''el => [...el.querySelectorAll('pre, .diff-split')].every(node =>
                    node.scrollHeight <= node.clientHeight + 1)'''), "no nested vertical scrolling"
                overflow()
                shot(f"sticky-{width}-{'main' if scope == '#output' else 'task'}-{kind.split(':')[0][1:]}")
                summary.click()
                assert not record.evaluate('(el) => el.open')
            if scope == '.task-dialog':
                page.keyboard.press('Escape')
        # Long split/unified diffs use the transcript's vertical scroll too.
        edit = page.locator('.tool-record').nth(3)
        edit.locator('summary').click()
        page.wait_for_timeout(100)
        assert edit.evaluate('''el => [...el.querySelectorAll('pre, .diff-split')].every(node =>
            getComputedStyle(node).display === 'none' || node.scrollHeight <= node.clientHeight + 1)''')
        overflow()

        load('ui-agents')
        page.locator('#transcript').evaluate('(el) => el.scrollTop = 0')
        page.wait_for_timeout(100)
        run = page.locator('.task-run').first
        run.focus()
        page.keyboard.press('Enter')
        card = page.locator('[aria-controls="task-review"]')
        expect(card).to_be_focused()
        page.wait_for_timeout(150)
        expect(page.locator('#latest')).to_be_visible()
        assert page.locator('.task-dialog[open]').count() == 0
        rect, viewport = card.bounding_box(), page.locator('#transcript').bounding_box()
        assert viewport['y'] <= rect['y'] < viewport['y'] + viewport['height']
        expect(card.locator('.task-badge')).to_have_text('子代理')
        assert style(card, 'borderLeftWidth') == '3px'
        assert style(card, 'borderColor') != style(page.locator('body'), 'borderColor')
        rotating(run.locator('.task-run-spin'))
        rotating(card.locator('.task-status'), '::before')
        rotating(page.locator('[aria-controls="task-queued"] .task-status'), '::before')
        shot(f"agent-jump-{width}")
        page.locator('#latest').click()
        expect(page.locator('#latest')).to_be_hidden()
        card.click()
        for group in page.locator('.task-dialog[open] .call-group:not([open]) > summary').all():
            group.click()
        task_label = page.locator('.task-dialog[open] .thinking-record:visible .activity-label').first
        assert style(task_label, 'fontSize') == '12px'
        assert style(task_label, 'fontWeight') == '400'
        rotating(page.locator('.task-dialog[open] .task-top h2'), '::before')
        rotating(page.locator('.task-dialog[open] [data-state="thinking"] .activity-icon'), '::after')
        page.locator('.task-dialog[open]').evaluate('(el) => el.dataset.status = "completed"')
        assert style(page.locator('.task-dialog[open] .task-top h2'), 'animationName', '::before') == 'none'
        overflow()
        page.keyboard.press('Escape')

    for state, selector, pseudo, icon_width in [
        ('ui-thinking', '[data-state="thinking"] .activity-icon', '::after', '12px'),
        ('ui-waiting', '.call-group[data-active="true"] > summary .activity-icon svg', None, '14px'),
        ('ui-tools', '.call-group[data-active="true"] > summary .activity-icon svg', None, '14px'),
    ]:
        load(state)
        el = page.locator(selector + ':visible').first
        handle = el.element_handle()
        rotating(el, pseudo, icon_width)
        if state == 'ui-thinking':
            dots = page.locator('[data-state="thinking"] .thinking-dots').first
            before = style(dots, 'clipPath')
            width = dots.bounding_box()['width']
            page.wait_for_timeout(450)
            assert style(dots, 'clipPath') != before
            assert dots.bounding_box()['width'] == width
            page.emulate_media(reduced_motion='reduce')
            assert style(dots, 'animationName') == 'none'
            page.emulate_media(reduced_motion='no-preference')
        if state == 'ui-waiting':
            expect(page.locator('[data-state="waiting"] .activity-label')).to_have_text('connecting...')
            page.locator('[data-state="waiting"]').evaluate('(el) => el.dataset.state = "running"')
            running = page.locator('[data-state="running"] .activity-icon').first
            assert style(running, 'animationName', '::after') == 'activity-spin'
            assert style(running, 'width', '::after') == '12px'
        if state == 'ui-tools':
            row = page.locator('.tool-activity[data-state="running"]').first
            expect(row).to_be_visible()
            expect(row.locator('.activity-label')).to_have_text('read')
        shot(state)
        page.locator('[data-state]').evaluate_all('(els) => els.forEach(el => el.dataset.state = "done")')
        page.locator('.call-group').evaluate_all('(els) => els.forEach(el => el.dataset.active = "false")')
        assert style(handle, 'animationName', pseudo) == 'none'
    assert not errors, errors
    print(json.dumps({"viewports": [1440, 390, 320], "checks": "palette/typography/raw-labels/density/module-badges/touch-targets/sticky/no-inner-scroll/jump/animation/reduced-motion", "browserErrors": errors}))
    browser.close()
