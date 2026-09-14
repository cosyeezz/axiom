import { marked } from "./vendor/marked.js";
import DOMPurify from "./vendor/purify.js";

const cache = new WeakMap();
const policy = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: ["img", "video", "audio", "form", "input", "button", "style"],
  FORBID_ATTR: ["style"],
};

const textLanguages = new Set(["纯文本", "text", "txt", "plaintext", "ascii", "diagram", "tree"]);
const isText = (language) => textLanguages.has(language.toLowerCase());
const wideCharacter = /[\u1100-\u115f\u2329\u232a\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe19\ufe30-\ufe6f\uff01-\uff60\uffe0-\uffe6\u{20000}-\u{3fffd}]|\p{Emoji_Presentation}|\uFE0F/u;
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const numericCell = /^[+-]?[\d,]+(?:\.\d+)?%?$/;
const placeholderCell = /^[-\u2013\u2014]$/;
const ruleLine = /^[\s|+]*[-\u2013\u2014=_\u2500\u2501\u2550]{3,}[\s|+\-\u2013\u2014=_\u2500\u2501\u2550]*$/;

// ponytail: only complete, single-line-cell ASCII tables; other diagrams stay verbatim.
function borderedRows(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const border = lines[0];
  if (!/^\+(?:-+\+){2,}$/.test(border) || lines.length < 5 ||
      lines[2] !== border || lines.at(-1) !== border) return null;
  const columns = border.split("+").length - 2;
  const rows = [];
  for (const line of lines.slice(1, -1)) {
    if (line === border) continue;
    if (!line.startsWith("|") || !line.endsWith("|")) return null;
    const cells = line.slice(1, -1).split("|").map((cell) => cell.trim());
    if (cells.length !== columns) return null;
    rows.push(cells);
  }
  return rows.length < 2 ? null : { rows, rules: new Set(), header: true };
}

// Space-aligned tables without borders: a column break is a gap blank in every line.
// ponytail: purely positional, no semantic guesses; "原文" restores the source on misreads.
function alignedRows(text) {
  const rules = new Set();
  const kept = [];
  for (const line of text.split(/\r?\n/).map((raw) => raw.replace(/\s+$/, ""))) {
    if (!line) continue;
    if (ruleLine.test(line)) { rules.add(kept.length); continue; }
    kept.push(line);
  }
  if (kept.length < 3 || kept.some((line) => line.includes("\t")) ||
      looksLikeDiagram(kept.join("\n"))) return null;
  // Display-width grid: a wide character also holds the following slot, so CJK stays aligned.
  const grid = kept.map((line) => {
    const slots = [];
    for (const { segment } of graphemes.segment(line)) {
      slots.push(segment);
      if (wideCharacter.test(segment)) slots.push(null);
    }
    return slots;
  });
  const width = Math.max(...grid.map((slots) => slots.length));
  const blank = (index) => grid.every((slots) => {
    const slot = slots[index];
    return slot === undefined || (slot !== null && !slot.trim());
  });
  const spans = [];
  for (let index = 0; index < width; index++) {
    if (blank(index)) continue;
    let end = index;
    // One blank slot can sit inside a cell ("2026-09-12 六"); two or more separate columns.
    while (end + 1 < width && (!blank(end + 1) || !blank(end + 2))) end++;
    spans.push([index, end + 1]);
    index = end;
  }
  if (spans.length < 3) return null;
  const rows = grid.map((slots) =>
    spans.map(([start, end]) => slots.slice(start, end).map((slot) => slot ?? "").join("").trim()));
  // Inconsistent padding leaves wide gaps inside a cell; that column split is a guess, so stay raw.
  if (rows.some((cells) => cells.some((value) => /\s\s/.test(value)))) return null;
  return { rows, rules, aligned: true };
}

function textTable(code, language) {
  if (!isText(language)) return null;
  const text = code.textContent.replace(/^\n+|\s+$/g, "");
  const parsed = borderedRows(text) || alignedRows(text);
  if (!parsed) return null;
  const { rows, rules } = parsed;
  // Numbers, percentages and "—" placeholders read better right-aligned, per column.
  const isNumberColumn = (sample, column) => {
    const values = sample.map((cells) => cells[column]).filter((value) => value && !placeholderCell.test(value));
    return values.length > 0 && values.every((value) => numericCell.test(value));
  };
  const columns = rows[0].map((_cell, column) => column);
  const body = columns.map((column) => isNumberColumn(rows.slice(1), column));
  // A "header" that is numeric where its column is numeric is really data (`ls -l`), so drop the head.
  const header = parsed.header ??
    !rows[0].some((cell, column) => body[column] && numericCell.test(cell));
  const numeric = header ? body : columns.map((column) => isNumberColumn(rows, column));
  const table = code.ownerDocument.createElement("table");
  if (parsed.aligned) table.className = "table-aligned";
  const head = header ? table.createTHead() : null;
  const section = table.createTBody();
  rows.forEach((cells, index) => {
    const heading = header && index === 0;
    const row = (heading ? head : section).insertRow();
    if (!heading && rules.has(index)) row.className = "row-rule";
    cells.forEach((value, column) => {
      const cell = code.ownerDocument.createElement(heading ? "th" : "td");
      if (heading) cell.scope = "col";
      if (numeric[column]) cell.className = "cell-number";
      cell.textContent = value;
      row.append(cell);
    });
  });
  return table;
}

function looksLikeDiagram(text) {
  const lines = text.split(/\r?\n/);
  // Structural signals, not semantic guesses: code languages never reach this detector.
  return lines.some((line) => /(?:[-=]{2,}>|<[-=]{2,}|[←→↔⇒⇐⇔])/.test(line)) ||
    lines.filter((line) => /[\u2500-\u257f]|\+(?:[-=]{2,}\+)+|^\s*(?:[|+] |[|+`\\]--|\|.*\|\s*$)/u.test(line)).length >= 2;
}

function layoutDiagram(code, language) {
  if (code.textContent.length > 20000 || !isText(language)) return false;
  // ponytail: 1/2-cell widths, max 20K chars to bound DOM size; incorrect source padding stays unchanged.
  const segments = graphemes.segment(code.textContent);
  const fragment = code.ownerDocument.createDocumentFragment();
  let column = 0;
  for (const { segment } of segments) {
    if (/^[\r\n]+$/.test(segment)) { fragment.append(segment); column = 0; continue; }
    if (segment === "\t") {
      const tab = code.ownerDocument.createElement("span");
      const width = 8 - column % 8;
      tab.className = `diagram-tab diagram-tab-${width}`;
      tab.textContent = segment;
      fragment.append(tab);
      column += width;
      continue;
    }
    const cell = code.ownerDocument.createElement("span");
    const wide = wideCharacter.test(segment);
    cell.className = wide ? "diagram-cell diagram-wide" : "diagram-cell";
    cell.textContent = segment;
    fragment.append(cell);
    column += wide ? 2 : 1;
  }
  code.replaceChildren(fragment);
  code.classList.add("text-diagram");
  return true;
}

function isJson(text) {
  try { JSON.parse(text); return true; } catch { return false; }
}

// CommonMark 在“** 紧贴标点+紧邻文字”时拒绝开/闭（中文 `**加粗。**下文`、`**“重点”**下文` 高发）。
// 仅在围栏代码块外把加粗首尾标点移出：`**x。**y` → `**x**。y`，渲染文本不变。
// ponytail: 行内反引号与缩进代码内的 ** 不处理，误配仅影响样式边界。
function fixCjkBold(text) {
  let fenced = false;
  return text.split("\n").map((line) => {
    if (/^\s{0,3}(?:```|~~~)/.test(line)) fenced = !fenced;
    if (fenced) return line;
    return line.replace(/\*\*([^*\n]+?)\*\*(?=\p{L})/gu, (raw, body) => {
      const core = body.replace(/^[^\p{L}\p{N}]+/u, "").replace(/[^\p{L}\p{N}]+$/u, "");
      if (!core || core === body) return raw;
      const lead = body.slice(0, body.indexOf(core));
      return `${lead}**${core}**${body.slice(body.indexOf(core) + core.length)}`;
    });
  }).join("\n");
}

function jsonControls(code, bar) {
  const doc = code.ownerDocument;
  const actions = doc.createElement("div");
  actions.className = "json-actions";
  const status = doc.createElement("span");
  status.className = "json-status";
  status.setAttribute("role", "status");
  const parse = (text) => JSON.parse(text, (_key, value) => {
    if (typeof value === "number" && (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))))
      throw new Error("数字超出安全范围，已保留原文");
    return value;
  });
  const operations = {
    "格式化": (text) => JSON.stringify(parse(text), null, 2),
    "压缩": (text) => JSON.stringify(parse(text)),
    "去转义": (text) => {
      const value = JSON.parse(text);
      if (typeof value !== "string") throw new Error("需要 JSON 字符串（含外层双引号）");
      return value;
    },
    "转义": (text) => JSON.stringify(text),
  };
  for (const [label, transform] of Object.entries(operations)) {
    const button = doc.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.onclick = () => {
      try {
        const result = transform(code.textContent);
        code.textContent = result;
        status.textContent = `已${label}`;
      } catch (error) { status.textContent = `${label}失败：${error.message}`; }
    };
    actions.append(button);
  }
  bar.append(actions);
  return status;
}

export function renderMarkdown(element, text = "") {
  const previous = cache.get(element);
  if (previous?.text === text) return;
  // Lex the whole document: late reference definitions can change earlier blocks.
  // Only parse/sanitize/replace changed blocks, preserving completed DOM and selection.
  // Bare JSON objects/arrays are data, not Markdown; never interpret their contents as HTML.
  const bareJson = /^[\s]*[\[{]/.test(text) && isJson(text);
  const tokens = (bareJson ? [{ type: "code", lang: "json", text }] : marked
    .lexer(fixCjkBold(text), { gfm: true }))
    .filter((token) => token.type !== "space");
  const blocks = tokens.map((token, index) => {
    const key = JSON.stringify(token);
    const old = previous?.blocks[index];
    if (old?.key === key) return old;
    const node = element.ownerDocument.createElement("div");
    node.className = "markdown-block";
    node.innerHTML = DOMPurify.sanitize(
      marked.parser([token], { gfm: true }),
      policy,
    );
    // Controls are created after sanitizing; Markdown cannot inject buttons or handlers.
    for (const pre of node.querySelectorAll("pre")) {
      const code = pre.querySelector("code");
      if (!code) continue;
      const language = [...code.classList].find((name) => name.startsWith("language-"))?.slice(9) || "纯文本";
      const block = element.ownerDocument.createElement("div");
      block.className = "code-block";
      const bar = element.ownerDocument.createElement("div");
      bar.className = "code-toolbar";
      const label = element.ownerDocument.createElement("span");
      const table = textTable(code, language);
      const json = language.toLowerCase() === "json" ||
        (["纯文本", "text", "txt", "plaintext"].includes(language) &&
          /^[\s]*[\[{]/.test(code.textContent) && isJson(code.textContent));
      const source = code.textContent;
      const diagram = !table && !json && looksLikeDiagram(source) && layoutDiagram(code, language);
      label.textContent = table ? "表格" : json ? "JSON" : diagram ? "字符示意图" : language;
      const copy = element.ownerDocument.createElement("button");
      copy.type = "button";
      copy.textContent = "复制";
      copy.setAttribute("aria-label", table ? "复制表格原文" : "复制代码");
      copy.setAttribute("aria-live", "polite");
      copy.onclick = async () => {
        try {
          await element.ownerDocument.defaultView.navigator.clipboard.writeText(code.textContent);
          copy.textContent = "已复制";
        } catch { copy.textContent = "复制失败，请选中复制"; }
        copy.onblur = () => { copy.textContent = "复制"; };
      };
      bar.append(label);
      const status = json ? jsonControls(code, bar) : null;
      if (json) copy.setAttribute("aria-label", "复制当前 JSON 内容");
      bar.append(copy);
      pre.before(block);
      block.append(bar, table || pre);
      if (status) block.append(status);
      if (!json && isText(language)) {
        const toggle = element.ownerDocument.createElement("button");
        toggle.type = "button";
        let optimized = Boolean(table || diagram);
        const updateToggle = () => {
          toggle.textContent = optimized ? "原文" : "优化";
          toggle.setAttribute("aria-label", optimized ? "切换到原文展示" : "切换到优化展示");
        };
        updateToggle();
        toggle.onclick = () => {
          if (optimized) {
            if (table) block.querySelector(".table-scroll").hidden = true;
            code.textContent = source;
            code.classList.remove("text-diagram");
            pre.hidden = false;
          } else if (table) {
            block.querySelector(".table-scroll").hidden = false;
            pre.hidden = true;
          } else if (!layoutDiagram(code, language)) return;
          optimized = !optimized;
          updateToggle();
        };
        if (source.length > 20000 && !table) {
          toggle.disabled = true;
          toggle.title = "超过 20,000 字符，保留原文以避免页面卡顿";
        }
        bar.insertBefore(toggle, copy);
      }
      if (table) { pre.hidden = true; block.append(pre); }
    }
    for (const table of node.querySelectorAll("table")) {
      const wrapper = element.ownerDocument.createElement("div");
      wrapper.className = "table-scroll";
      table.before(wrapper);
      wrapper.append(table);
    }
    for (const region of node.querySelectorAll("pre, .table-scroll")) {
      region.tabIndex = 0;
      region.setAttribute("role", "region");
      region.setAttribute("aria-label", region.tagName === "PRE" ? "代码，可横向滚动" : "表格，可横向滚动");
    }
    if (old) old.node.replaceWith(node);
    else element.append(node);
    return { key, node };
  });
  for (const block of previous?.blocks.slice(blocks.length) || [])
    block.node.remove();
  cache.set(element, { text, blocks });
}
