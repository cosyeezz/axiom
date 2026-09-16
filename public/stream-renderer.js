import { createPlayback } from "./stream-playback.js";

// One scheduler owns DOM writes. The timeout fallback is only for hosts without rAF (Node tests).
export function createStreamRenderer(
  renderMarkdown,
  afterPaint,
  schedule = (fn, delay) => globalThis.requestAnimationFrame ? requestAnimationFrame(fn) : setTimeout(fn, delay),
  cancel = (id) => globalThis.cancelAnimationFrame ? cancelAnimationFrame(id) : clearTimeout(id),
  interval = 40,
  now = () => performance.now(),
) {
  const dirty = new Set();
  let states = new WeakMap();
  let frame, dirtySince, epoch = 0, disposed = false;
  let interactUntil = 0, document, motion;
  const hidden = () => document?.visibilityState === "hidden";
  const mounted = (item) => item.mounted !== false && item.node?.isConnected !== false &&
    !item.node?.hidden && (!item.task || item.task.node.open);
  function bind(item) {
    if (document) return;
    document = item.text.ownerDocument;
    motion = document.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)");
    document.addEventListener("visibilitychange", visibility);
    document.addEventListener("selectionchange", selectionChanged);
    motion?.addEventListener?.("change", preferences);
  }
  function stopFrame() {
    epoch++;
    if (frame !== undefined) cancel(frame);
    frame = undefined;
  }
  function queue(delay = 0) {
    if (disposed || hidden() || frame !== undefined || !dirty.size) return;
    const generation = epoch;
    frame = schedule(() => { if (generation === epoch && !disposed) draw(); }, delay);
  }
  function selected(item) {
    const selection = document?.getSelection();
    return selection && !selection.isCollapsed &&
      (item.node || item.text).contains(selection.anchorNode);
  }
  function selectionChanged() { queue(); }
  function visibility() {
    stopFrame();
    // Keep only the dirty item references while hidden; discard every old cursor.
    states = new WeakMap();
    if (!hidden()) preferences();
  }
  function preferences() {
    stopFrame();
    for (const item of dirty) {
      const state = states.get(item);
      if (state) state.align = true;
    }
    // Restored/new state aligns too, rather than replaying background output.
    for (const item of dirty) if (!states.has(item)) states.set(item, { align: true });
    queue();
  }
  function draw() {
    frame = undefined;
    const time = now();
    const wait = Math.min(interactUntil - time, dirtySince + 1000 - time);
    if (wait > 0) { queue(wait); return; }
    let changed = false, runnable = false;
    for (const item of dirty) {
      if (!mounted(item)) { dirty.delete(item); states.delete(item); continue; }
      if (selected(item)) continue; // Selection owns the nodes until it is released.
      const result = paint(item, false, time);
      changed ||= result.changed;
      if (!result.pending) dirty.delete(item);
      else runnable = true;
      // ponytail: yield between messages after 6ms; a single Markdown parse is bounded by its size fallback.
      if (now() - time >= 6) { runnable ||= dirty.size > 0; break; }
    }
    if (changed) afterPaint(); // Layout/scroll ownership remains entirely with the caller.
    if (!dirty.size) dirtySince = undefined;
    if (runnable) queue(16);
  }
  function paint(item, final, time = now()) {
    if (item.task && !item.task.node.open) return { changed: false, pending: false };
    if (item.pending) { item.pending = false; item.prepare?.(item); }
    let state = states.get(item);
    if (!state) { state = { align: Boolean(item.paintedText) }; states.set(item, state); }
    let text = item.buffer;
    let pending = false;
    if (!final && item.active && !item.task && renderMarkdown.isPlainText?.(text)) {
      state.playback ||= createPlayback();
      const result = state.playback.update(text, time, {
        align: state.align || motion?.matches,
        revision: item.generation ?? 0,
      });
      text = text.slice(0, result.offset);
      pending = result.pending;
      state.align = false;
    } else {
      state.playback = undefined;
      // Complex structures are whole-document, coalesced updates, never per-grapheme parsing.
      if (!final && item.active && !motion?.matches && state.nextMarkdown > time && item.paintedText !== text) return { changed: false, pending: true };
    }
    let changed = false;
    if (item.paintedText !== text) {
      if (item.node?.classList.contains("user")) item.text.textContent = text;
      else renderMarkdown(item.text, text);
      item.paintedText = text;
      state.nextMarkdown = time + Math.max(100, (now() - time) * 4);
      changed = true;
    }
    if (item.processText && item.processGroup?.open && item.paintedProcess !== item.processBuffer) {
      renderMarkdown(item.processText, item.processBuffer || "");
      item.paintedProcess = item.processBuffer;
      changed = true;
    }
    item.thinking.hidden = !item.reasoning;
    if (item.thinking.open && item.paintedReasoning !== item.reasoning) {
      renderMarkdown(item.thought, item.reasoning);
      item.paintedReasoning = item.reasoning;
      changed = true;
    }
    return { changed, pending };
  }
  function clear() {
    stopFrame();
    dirty.clear();
    states = new WeakMap();
    dirtySince = undefined;
    interactUntil = 0;
  }
  return {
    interact() { interactUntil = now() + 520; },
    mark(item) {
      if (disposed || (item.task && !item.task.node.open)) return;
      bind(item);
      if (!dirty.size) dirtySince = now();
      dirty.add(item);
      queue(interval);
    },
    flush(item) {
      if (disposed) return;
      bind(item);
      dirty.delete(item);
      if (!dirty.size) stopFrame();
      // Business terminal state is already committed. Selection/hidden pages defer only the DOM.
      if (selected(item) || hidden()) {
        dirty.add(item);
        states.set(item, { align: true });
        return;
      }
      paint(item, true);
      states.delete(item);
      if (!item.task || item.task.node.open) afterPaint();
    },
    disposeMessage(item) {
      dirty.delete(item);
      states.delete(item);
      if (!dirty.size) stopFrame();
    },
    clear,
    dispose() {
      clear();
      disposed = true;
      document?.removeEventListener("visibilitychange", visibility);
      document?.removeEventListener("selectionchange", selectionChanged);
      motion?.removeEventListener?.("change", preferences);
      document = motion = undefined;
    },
  };
}
