import { renderMarkdown } from './markdown.js';
import { copyText } from './clipboard.js';

export function createCompactionView(root, load) {
  let key, busy = false, generation = 0, completed = false, knownRequests = 0, revision;
  const sections = new Map();
  function section(id, title, source, code = false) {
    let item = sections.get(id);
    if (!item) {
      const wrap = document.createElement('details'); wrap.className = 'compaction-document';
      const heading = document.createElement('summary'); heading.textContent = title;
      const toolbar = document.createElement('div'); toolbar.className = 'compaction-document-actions';
      const toggle = document.createElement('button'); toggle.type = 'button'; toggle.textContent = '查看原文';
      const copy = document.createElement('button'); copy.type = 'button'; copy.textContent = '复制原文';
      const bottom = document.createElement('button'); bottom.type = 'button'; bottom.textContent = '回到底部';
      const body = document.createElement('div'); body.className = 'compaction-document-body markdown';
      item = { wrap, body, source: '', raw: code, positions: [0, 0] };
      toggle.textContent = code ? '查看 Markdown' : '查看原文';
      const draw = () => {
        item.pre ??= document.createElement('pre');
        item.md ??= document.createElement('div');
        if (!item.pre.parentNode) body.append(item.pre, item.md);
        item.pre.hidden = !item.raw;
        item.md.hidden = item.raw;
        if (item.raw) item.pre.textContent = item.source;
        else renderMarkdown(item.md, item.source.replace(/(<\/?[A-Za-z][^>\n]*>)/g, tag => tag.replaceAll('<', '&lt;').replaceAll('>', '&gt;')));
      };
      item.draw = draw;
      toggle.onclick = () => { item.positions[Number(item.raw)] = body.scrollTop; item.raw = !item.raw; toggle.textContent = item.raw ? '查看 Markdown' : '查看原文'; toggle.setAttribute('aria-pressed', String(item.raw)); draw(); body.scrollTop = item.positions[Number(item.raw)]; };
      copy.onclick = async () => { try { await copyText(item.source); copy.textContent = '已复制'; } catch { copy.textContent = '复制失败'; } finally { setTimeout(() => { copy.textContent = '复制原文'; }, 1500); } };
      bottom.onclick = () => { body.scrollTop = body.scrollHeight; };
      toolbar.append(toggle, copy, bottom); wrap.append(heading, toolbar, body); root.append(wrap); sections.set(id, item);
    }
    if (item.source !== source) {
      const follow = item.wrap.open && item.body.scrollHeight - item.body.scrollTop - item.body.clientHeight < 40;
      const position = item.body.scrollTop;
      item.source = source; item.draw();
      item.body.scrollTop = follow ? item.body.scrollHeight : position;
    }
  }
  return async (sessionId, runId) => {
    const nextKey = `${sessionId}/${runId}`;
    if (nextKey !== key) { key = nextKey; generation++; sections.clear(); root.replaceChildren(); busy = false; completed = false; knownRequests = 0; revision = undefined; }
    if (busy || completed) return;
    busy = true; const version = generation;
    try {
      const attempt = await load(sessionId, runId, knownRequests, revision);
      if (version !== generation) return;
      if (attempt.unchanged) return;
      revision = attempt.revision;
      if (sections.has('error')) { sections.get('error').wrap.remove(); sections.delete('error'); }
      completed = !!attempt.endedAt;
      knownRequests = attempt.requests?.length ?? knownRequests;
      for (const [i, req] of (attempt.requests ?? []).entries()) {
        if (req.context) {
        section(`${req.id}-system`, `请求 ${i + 1} · 系统提示词`, req.context?.systemPrompt ?? '');
        section(`${req.id}-request`, `请求 ${i + 1} · 完整请求原文`, JSON.stringify(req.context, null, 2), true);
        for (const [messageIndex, message] of (req.context.messages ?? []).entries()) {
          const blocks = typeof message.content === 'string' ? [{ type: 'text', text: message.content }] : message.content ?? [];
          for (const [blockIndex, block] of blocks.entries()) {
            const label = `请求 ${i + 1} · ${message.role} · 内容 ${messageIndex + 1}.${blockIndex + 1}`;
            section(`${req.id}-input-${messageIndex}-${blockIndex}`, label, block.type === 'text' ? block.text : JSON.stringify(block, null, 2), block.type !== 'text');
          }
        }
        }
        const first = !sections.has(`${req.id}-stream`);
        section(`${req.id}-stream`, `请求 ${i + 1} · 完整生成正文`, req.text ?? '等待正文…');
        if (first && attempt.status === 'summarizing') sections.get(`${req.id}-stream`).wrap.open = true;
      }
      if (attempt.rawSummary) section('raw', '模型原始摘要', attempt.rawSummary);
      if (attempt.mode === 'native-fallback') section('verification', '原生回退 · 未进行原文摘录核验', '本次为一次新的原生生成，未复用增强失败候选。');
      if (attempt.excerpts) section('excerpts', `原文核验 · ${attempt.excerpts.length} 项（不是语义核验）`, JSON.stringify(attempt.excerpts, null, 2), true);
      if (attempt.finalSummary) section('final', '最终摘要', attempt.finalSummary);
      if (attempt.stateDoc) section('task-state', '任务状态文档（截至压缩切点）', attempt.stateDoc);
    } catch (e) { if (version === generation) section('error', '过程记录读取失败', e.message, true); }
    finally { if (version === generation) busy = false; }
  };
}
