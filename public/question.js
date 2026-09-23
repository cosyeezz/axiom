import { actionIconNode } from "./icons.js";
export function createQuestionUI({ root, reply, focusPrompt }) {
  const drafts = new Map();
  let sessionId, requests = [], connected = true, activeKey;
  const keyOf = (id) => `${sessionId}:${id}`;
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };
  const current = () => requests[0];
  const draft = () => drafts.get(keyOf(current().toolCallId));
  const answersOf = (state) => state.answers.map((values, i) => {
    const custom = state.custom[i].trim();
    return [...new Set([...values, ...(state.customOn[i] && custom ? [custom] : [])])];
  });
  function focusOption() {
    if (!current()) return;
    root.querySelectorAll('.question-choice')[draft().focus[draft().tab]]?.focus({ preventScroll: true });
  }
  function draw(focus = false, measuring = false) {
    root.replaceChildren();
    const request = current();
    root.hidden = !request;
    if (!request) { activeKey = undefined; return; }
    const key = keyOf(request.toolCallId);
    if (!drafts.has(key)) drafts.set(key, {
      tab: 0, answers: request.questions.map(() => []), custom: request.questions.map(() => ""),
      customOn: request.questions.map(() => false), focus: request.questions.map(() => 0), sending: false, error: "",
    });
    const state = draft(), question = request.questions[state.tab];
    // 同组题按当前宽度一次测量最高内容，切题时不改变输入区高度。
    const width = root.clientWidth;
    if (!measuring && state.width !== width) {
      state.width = width;
      const selected = state.tab;
      state.panelHeight = 0;
      request.questions.forEach((_, i) => {
        state.tab = i; draw(false, true);
        state.panelHeight = Math.max(state.panelHeight, root.querySelector('.question-panel').getBoundingClientRect().height);
      });
      state.tab = selected;
    }
    const disabled = !connected || state.sending;
    root.replaceChildren();
    const heading = el('div', 'question-heading');
    const emblem = el('span', 'question-emblem');
    emblem.append(actionIconNode('chat'));
    heading.append(emblem, el('span', '', '需要你确认'), el('span', 'question-mode', question.multiple ? '可多选' : '单选'));
    root.append(heading);
    const tabs = el('div', 'question-tabs');
    tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', '待确认问题');
    tabs.hidden = request.questions.length === 1;
    request.questions.forEach((q, i) => {
      const tab = el('button', 'question-tab');
      tab.append(el('span', 'question-step', String(i + 1)), el('span', '', q.header));
      tab.type = 'button'; tab.setAttribute('role', 'tab'); tab.id = `question-tab-${i}`;
      tab.setAttribute('aria-selected', String(i === state.tab)); tab.setAttribute('aria-controls', 'question-panel');
      tab.tabIndex = i === state.tab ? 0 : -1; tab.disabled = disabled;
      tab.onclick = () => switchTab(i);
      tabs.append(tab);
    });
    root.append(tabs);
    const panel = el('div', 'question-panel'); panel.id = 'question-panel';
    if (!measuring) panel.style.minHeight = `${state.panelHeight || 0}px`;
    panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', `question-tab-${state.tab}`);
    const title = el('h3', '', question.question); title.id = 'question-title';
    const description = el('p', 'question-description', question.description); description.id = 'question-description';
    panel.append(title, description);
    if (request.proposal) {
      const details = el('details', 'question-proposal');
      details.open = true;
      details.append(el('summary', '', '完整目标与变更内容'));
      const content = el('pre', '', JSON.stringify(request.proposal, null, 2));
      content.style.whiteSpace = 'pre-wrap';
      content.style.overflowWrap = 'anywhere';
      content.style.maxHeight = '240px';
      content.style.overflow = 'auto';
      details.append(content);
      panel.append(details);
    }
    const options = el('div', 'question-options');
    options.setAttribute('role', question.multiple ? 'group' : 'radiogroup');
    options.setAttribute('aria-labelledby', 'question-title'); options.setAttribute('aria-describedby', 'question-description');
    const choice = (label, description, picked, index, action) => {
      const button = el('button', 'question-choice'); button.type = 'button'; button.disabled = disabled;
      button.setAttribute('role', question.multiple ? 'checkbox' : 'radio'); button.setAttribute('aria-checked', String(picked));
      button.tabIndex = index === state.focus[state.tab] ? 0 : -1;
      const mark = el('span', 'question-mark'); if (picked) mark.append(actionIconNode('check')); mark.setAttribute('aria-hidden', 'true');
      const copy = el('span', 'question-copy'); copy.append(el('span', 'question-label', label));
      if (description) copy.append(el('span', 'question-option-description', description));
      button.append(mark, copy);
      button.onfocus = () => { state.focus[state.tab] = index; options.querySelectorAll('.question-choice').forEach((b, n) => b.tabIndex = n === index ? 0 : -1); };
      button.onclick = () => { action(); draw(true); };
      options.append(button);
    };
    question.options.forEach((option, i) => choice(option.label, option.description, state.answers[state.tab].includes(option.label), i, () => {
      if (question.multiple) {
        const values = state.answers[state.tab];
        state.answers[state.tab] = values.includes(option.label) ? values.filter((v) => v !== option.label) : [...values, option.label];
      } else { state.answers[state.tab] = [option.label]; state.customOn[state.tab] = false; }
      state.focus[state.tab] = i;
    }));
    choice('自定义回答', '', state.customOn[state.tab], question.options.length, () => {
      state.customOn[state.tab] = !state.customOn[state.tab];
      if (!question.multiple) state.answers[state.tab] = [];
      state.focus[state.tab] = question.options.length;
    });
    panel.append(options);
    const input = el('textarea', 'question-custom'); input.rows = 1; input.maxLength = 4000;
    input.setAttribute('aria-label', '自定义回答'); input.placeholder = '输入你的答案'; input.value = state.custom[state.tab];
    input.disabled = disabled;
    input.oninput = () => {
      state.custom[state.tab] = input.value; state.customOn[state.tab] = true;
      if (!question.multiple) state.answers[state.tab] = [];
      options.querySelectorAll('.question-choice').forEach((button, i) => {
        const picked = i === question.options.length || state.answers[state.tab].includes(question.options[i]?.label);
        button.setAttribute('aria-checked', String(picked)); button.querySelector('.question-mark').replaceChildren(...(picked ? [actionIconNode('check')] : []));
      });
      resizeInput();
      updateFooter();
    };
    function resizeInput() {
      input.style.height = 'auto';
      input.style.height = `${input.scrollHeight + input.offsetHeight - input.clientHeight}px`;
      input.scrollTop = 0;
      if (!measuring) {
        state.panelHeight = Math.max(state.panelHeight || 0, panel.getBoundingClientRect().height);
        panel.style.minHeight = `${state.panelHeight}px`;
      }
    }
    panel.append(input); root.append(panel);
    resizeInput();
    const footer = el('div', 'question-footer'), progress = el('span', 'question-progress');
    const submit = el('button', 'question-submit', state.sending ? '提交中…' : '提交全部答案'); submit.type = 'button'; submit.onclick = send;
    function updateFooter() {
      const count = answersOf(state).filter((answer) => answer.length).length;
      progress.textContent = connected ? `已回答 ${count} / ${request.questions.length}` : '连接已断开，重连后可提交';
      submit.disabled = disabled || count !== request.questions.length;
      tabs.querySelectorAll('button').forEach((button, i) => {
        const done = answersOf(state)[i].length > 0;
        button.dataset.answered = String(done);
        button.setAttribute('aria-label', `${request.questions[i].header}，${done ? '已回答' : '未回答'}`);
        const step = button.querySelector('.question-step');
        step.replaceChildren(done ? actionIconNode('check') : document.createTextNode(String(i + 1)));
      });
      progress.dataset.complete = String(count === request.questions.length);
    }
    updateFooter(); footer.append(progress, submit); root.append(footer);
    const help = el('div', 'question-help');
    for (const [label, names] of [
      ['切题', ['back', 'chevron']],
      ['移动', ['up', 'down']],
      ['选择', ['space']],
      ['下一题 / 提交', ['enter']],
    ]) {
      const hint = el('span', 'question-hint');
      names.forEach((name) => { const keycap = el('kbd'); keycap.append(actionIconNode(name)); hint.append(keycap); });
      hint.append(document.createTextNode(label)); help.append(hint);
    }
    help.setAttribute('aria-label', '左右方向键切题，上下方向键移动，空格选择，Enter 下一题或提交');
    root.append(help);
    if (state.error) { const error = el('p', 'question-error', state.error); error.setAttribute('role', 'alert'); root.append(error); }
    if (measuring) return;
    activeKey = key;
    if (focus && !disabled) focusOption();
  }
  function switchTab(index) {
    if (!current() || !connected || draft().sending) return;
    draft().tab = Math.max(0, Math.min(current().questions.length - 1, index)); draw(true);
  }
  async function send() {
    if (!current() || !connected) return;
    const request = current(), state = draft(), target = sessionId, key = keyOf(request.toolCallId);
    const answers = answersOf(state);
    if (state.sending || answers.some((values) => !values.length)) return;
    state.sending = true; state.error = ''; draw();
    try {
      await reply({ sessionId: target, toolCallId: request.toolCallId, answers });
      drafts.delete(key);
      if (sessionId === target) {
        requests = requests.filter((r) => r.toolCallId !== request.toolCallId);
        draw(!!current()); if (!current()) focusPrompt?.();
      }
    } catch (error) {
      state.error = error.message || String(error);
    } finally {
      state.sending = false;
      if (sessionId === target && current()?.toolCallId === request.toolCallId) draw();
    }
  }
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => {
    if (current() && draft().width !== root.clientWidth) {
      const input = root.querySelector('.question-custom');
      const editing = document.activeElement === input;
      const selection = editing && [input.selectionStart, input.selectionEnd, input.selectionDirection];
      const focused = root.contains(document.activeElement);
      draw(focused && !editing);
      if (editing) {
        const restored = root.querySelector('.question-custom');
        restored.focus({ preventScroll: true }); restored.setSelectionRange(...selection);
      }
    }
  }).observe(root);
  root.addEventListener('keydown', (event) => {
    if (!current() || !connected || draft().sending || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target.matches('textarea, input')) return;
    const state = draft();
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault(); switchTab(state.tab + (event.key === 'ArrowRight' ? 1 : -1));
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault(); state.focus[state.tab] = Math.max(0, Math.min(current().questions[state.tab].options.length, state.focus[state.tab] + (event.key === 'ArrowDown' ? 1 : -1))); focusOption();
    } else if (event.key === 'Enter' && !event.target.matches('.question-submit')) {
      event.preventDefault();
      if (!answersOf(state)[state.tab].length) return;
      if (state.tab === current().questions.length - 1) void send(); else switchTab(state.tab + 1);
    }
  });
  return {
    show(id, pending) {
      const changed = id !== sessionId;
      sessionId = id; requests = pending || [];
      const keys = new Set(requests.map((r) => keyOf(r.toolCallId)));
      for (const key of drafts.keys()) if (key.startsWith(`${id}:`) && !keys.has(key)) drafts.delete(key);
      draw(!changed && current() && activeKey !== keyOf(current().toolCallId));
    },
    asked(id, request) {
      if (id !== sessionId) return;
      if (!requests.some((r) => r.toolCallId === request.toolCallId)) requests.push(request);
      if (current()?.toolCallId === request.toolCallId) draw(activeKey !== keyOf(request.toolCallId));
    },
    closed(id, toolCallId) {
      drafts.delete(`${id}:${toolCallId}`);
      if (id !== sessionId) return;
      const hadFocus = root.contains(document.activeElement), first = current()?.toolCallId === toolCallId;
      requests = requests.filter((r) => r.toolCallId !== toolCallId);
      if (first) { draw(hadFocus && !!current()); if (hadFocus && !current()) focusPrompt?.(); }
    },
    setConnected(value) { if (connected === value) return; connected = value; if (current()) draw(); },
    hide() { sessionId = undefined; requests = []; draw(); },
  };
}
