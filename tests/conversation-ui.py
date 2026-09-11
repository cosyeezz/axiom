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
        page.goto("http://127.0.0.1:4321")
        page.wait_for_selector("#workspace:not([hidden])")
        page.wait_for_timeout(150)
        page.evaluate('(id) => localStorage.setItem("axiom.session", id)', id)
        page.reload()
        page.wait_for_selector("#workspace:not([hidden])")
        page.wait_for_timeout(150)
        assert page.evaluate('() => localStorage.getItem("axiom.session")') == id

    def style(el, key, pseudo=None):
        return el.evaluate('(el, args) => getComputedStyle(el, args[1])[args[0]]', [key, pseudo])

    def shot(name):
        if out:
            page.wait_for_timeout(150)
            page.screenshot(path=str(out / (name + ".png")))

    def overflow():
        assert page.evaluate('''() => document.documentElement.scrollWidth <= innerWidth &&
            [...document.querySelectorAll('#output, .task-dialog[open]')].every(el => el.scrollWidth <= el.clientWidth)''')

    def rotating(el, pseudo=None):
        assert style(el, "animationName", pseudo) in ["activity-spin", "task-run-spin"]
        assert style(el, "animationDuration", pseudo) == "1.6s"
        assert style(el, "width", pseudo) == "12px"
        before = style(el, "transform", pseudo)
        page.wait_for_timeout(120)
        assert style(el, "transform", pseudo) != before, "spinner must actually move"
        page.emulate_media(reduced_motion="reduce")
        assert style(el, "animationName", pseudo) == "none"
        page.emulate_media(reduced_motion="no-preference")

    for width in [1440, 390, 320]:
        page.set_viewport_size({"width": width, "height": 1000 if width == 1440 else 844})
        load("ui-review")
        contrast = page.locator('#text-contrast-button')
        contrast.hover()
        expect(page.locator('#ax-tooltip.ax-show')).to_be_visible()
        expect(page.locator('#ax-tooltip')).to_have_text('文字对比度')
        page.keyboard.press('Escape')
        contrast.click()
        expect(page.locator('#text-contrast-popover')).to_be_visible()
        page.locator('#text-contrast-range').fill('150')
        assert page.locator('html').get_attribute('data-text-contrast') == '150'
        page.reload()
        page.wait_for_selector('#workspace:not([hidden])')
        assert page.locator('html').get_attribute('data-text-contrast') == '150'
        page.locator('#text-contrast-button').click()
        page.locator('#text-contrast-reset').click()
        page.keyboard.press('Escape')
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
        for scope, scroll in [('#output', '#transcript'), ('.task-dialog', '.task-body')]:
            if scope == '.task-dialog':
                page.locator('.task-card').click()
            for kind in (['.thinking-record:not([hidden])', '.tool-record'] if scope == '#output' else ['.thinking-record:not([hidden])', '.task-system-prompt']):
                record = page.locator(f'{scope} {kind}').first
                record.locator('summary').click()
                page.wait_for_timeout(120)
                record.evaluate('''(el, selector) => {
                    const scroller = document.querySelector(selector);
                    scroller.scrollTop += el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + 650;
                }''', scroll)
                page.wait_for_timeout(120)
                summary = record.locator('summary')
                scroller = page.locator(scroll)
                sticky_top = scroller.bounding_box()['y'] + float(style(scroller, 'paddingTop').removesuffix('px'))
                assert abs(summary.bounding_box()['y'] - sticky_top) <= 2, (width, scope, kind, summary.bounding_box(), sticky_top)
                expect(summary.locator('.when-open svg')).to_be_visible()
                assert record.evaluate('''el => [...el.querySelectorAll('pre, .diff-split')].every(node =>
                    node.scrollHeight <= node.clientHeight + 1)'''), "no nested vertical scrolling"
                overflow()
                shot(f"sticky-{width}-{'main' if scope == '#output' else 'task'}-{kind.split(':')[0][1:]}")
                summary.locator('.when-open').click()
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
        expect(card.locator('.task-badge')).to_have_text('SUBAGENT')
        assert style(card, 'borderLeftWidth') == '3px'
        assert style(card, 'borderColor') != style(page.locator('body'), 'borderColor')
        rotating(run.locator('.task-run-spin'))
        rotating(card.locator('.task-status'), '::before')
        rotating(page.locator('[aria-controls="task-queued"] .task-status'), '::before')
        shot(f"agent-jump-{width}")
        page.locator('#latest').click()
        expect(page.locator('#latest')).to_be_hidden()
        card.click()
        task_label = page.locator('.task-dialog[open] .thinking-record:visible .activity-label').first
        assert style(task_label, 'fontSize') == '12px'
        assert style(task_label, 'fontWeight') == '400'
        rotating(page.locator('.task-dialog[open] .task-top h2'), '::before')
        rotating(page.locator('.task-dialog[open] [data-state="thinking"] .activity-icon'), '::after')
        page.locator('.task-dialog[open]').evaluate('(el) => el.dataset.status = "completed"')
        assert style(page.locator('.task-dialog[open] .task-top h2'), 'animationName', '::before') == 'none'
        overflow()
        page.keyboard.press('Escape')

    for state, selector, pseudo in [
        ('ui-thinking', '[data-state="thinking"] .activity-icon', '::after'),
        ('ui-waiting', '[data-state="waiting"] .activity-icon', '::after'),
        ('ui-tools', '[data-state="running"] .tool-status', '::before'),
    ]:
        load(state)
        el = page.locator(selector + ':visible').first
        handle = el.element_handle()
        rotating(el, pseudo)
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
            rotating(page.locator('[data-state="running"] .activity-icon'), '::after')
        shot(state)
        page.locator('[data-state]').evaluate_all('(els) => els.forEach(el => el.dataset.state = "done")')
        assert style(handle, 'animationName', pseudo) == 'none'
    assert not errors, errors
    print(json.dumps({"viewports": [1440, 390, 320], "checks": "palette/typography/raw-labels/density/module-badges/touch-targets/sticky/no-inner-scroll/jump/animation/reduced-motion", "browserErrors": errors}))
    browser.close()
