// One frame for all changed agents; never repaint idle siblings.
export function createStreamRenderer(
  renderMarkdown,
  afterPaint,
  schedule = requestAnimationFrame,
  cancel = cancelAnimationFrame,
) {
  const dirty = new Set();
  let frame;
  function paint(item) {
    if (item.task && !item.task.node.open) return;
    if (item.paintedText !== item.buffer) {
      renderMarkdown(item.text, item.buffer);
      item.paintedText = item.buffer;
    }
    item.thinking.hidden = !item.reasoning;
    if (item.thinking.open && item.paintedReasoning !== item.reasoning) {
      const node =
        item.thought.firstChild ||
        item.thought.appendChild(item.thought.ownerDocument.createTextNode(""));
      if (item.reasoning.startsWith(node.data))
        node.appendData(item.reasoning.slice(node.length));
      else node.data = item.reasoning;
      item.paintedReasoning = item.reasoning;
    }
  }
  return {
    mark(item) {
      if (item.task && !item.task.node.open) return;
      dirty.add(item);
      if (frame !== undefined) return;
      frame = schedule(() => {
        frame = undefined;
        for (const item of dirty) paint(item);
        dirty.clear();
        afterPaint();
      });
    },
    flush(item) {
      dirty.delete(item);
      paint(item);
      if (!item.task || item.task.node.open) afterPaint();
    },
    clear() {
      if (frame !== undefined) cancel(frame);
      frame = undefined;
      dirty.clear();
    },
  };
}
