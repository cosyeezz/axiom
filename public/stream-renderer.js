// One frame for all changed agents; never repaint idle siblings.
// 节流：首次标记后 interval 毫秒再绘制，期间到达的 delta 只累计（不重置计时，避免持续输入被饿死）。
// item.prepare(item) 在绘制前执行一次，让调用方把 delta 预处理（去标签/拆分回答）延后到真正绘制时。
export function createStreamRenderer(
  renderMarkdown,
  afterPaint,
  schedule = (fn, delay) => setTimeout(fn, delay),
  cancel = (id) => clearTimeout(id),
  interval = 40,
  now = () => performance.now(),
) {
  const dirty = new Set();
  let frame, dirtySince;
  let interactUntil = 0;
  function draw() {
    frame = undefined;
    const time = now();
    // ponytail: 全部可见流共享让路窗口；持续交互最多延后 1 秒，之后必须补画。
    const wait = Math.min(interactUntil - time, dirtySince + 1000 - time);
    if (wait > 0) {
      frame = schedule(draw, wait);
      return;
    }
    for (const item of dirty) paint(item);
    dirty.clear();
    dirtySince = undefined;
    afterPaint();
  }
  function paint(item) {
    if (item.task && !item.task.node.open) return;
    if (item.pending) {
      item.pending = false;
      item.prepare?.(item);
    }
    if (item.paintedText !== item.buffer) {
      if (item.node?.classList.contains("user")) item.text.textContent = item.buffer;
      else renderMarkdown(item.text, item.buffer);
      item.paintedText = item.buffer;
    }
    if (item.processText && item.paintedProcess !== item.processBuffer) {
      renderMarkdown(item.processText, item.processBuffer || "");
      item.paintedProcess = item.processBuffer;
    }
    item.thinking.hidden = !item.reasoning;
    if (item.thinking.open && item.paintedReasoning !== item.reasoning) {
      renderMarkdown(item.thought, item.reasoning);
      item.paintedReasoning = item.reasoning;
    }
  }
  return {
    interact() { interactUntil = now() + 520; },
    mark(item) {
      if (item.task && !item.task.node.open) return;
      if (!dirty.size) dirtySince = now();
      dirty.add(item);
      if (frame !== undefined) return;
      frame = schedule(draw, interval);
    },
    flush(item) {
      dirty.delete(item);
      // 最后一个待绘项收口后挂起定时器已无用，就地取消；还有其他 dirty 项时保留。
      if (!dirty.size && frame !== undefined) {
        cancel(frame);
        frame = undefined;
      }
      paint(item);
      if (!item.task || item.task.node.open) afterPaint();
    },
    clear() {
      if (frame !== undefined) cancel(frame);
      frame = undefined;
      dirty.clear();
      dirtySince = undefined;
      interactUntil = 0;
    },
  };
}
