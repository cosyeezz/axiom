import { marked } from "./vendor/marked.js";
import DOMPurify from "./vendor/purify.js";

const cache = new WeakMap();
const policy = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: ["img", "video", "audio", "form", "input", "button", "style"],
  FORBID_ATTR: ["style"],
};

// ponytail: only complete, single-line-cell ASCII tables; other diagrams stay verbatim.
function asciiTable(code, language) {
  if (!["纯文本", "text", "txt", "plaintext", "ascii"].includes(language)) return null;
  const lines = code.textContent.trim().split(/\r?\n/).map((line) => line.trim());
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
  if (rows.length < 2) return null;
  const table = code.ownerDocument.createElement("table");
  const head = table.createTHead();
  const body = table.createTBody();
  rows.forEach((cells, index) => {
    const row = (index === 0 ? head : body).insertRow();
    for (const text of cells) {
      const cell = code.ownerDocument.createElement(index === 0 ? "th" : "td");
      if (index === 0) cell.scope = "col";
      cell.textContent = text;
      row.append(cell);
    }
  });
  return table;
}

function isJson(text) {
  try { JSON.parse(text); return true; } catch { return false; }
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
    .lexer(text, { gfm: true }))
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
      const table = asciiTable(code, language);
      const json = language.toLowerCase() === "json" ||
        (["纯文本", "text", "txt", "plaintext"].includes(language) &&
          /^[\s]*[\[{]/.test(code.textContent) && isJson(code.textContent));
      label.textContent = table ? "表格" : json ? "JSON" : language;
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
      if (table) pre.remove();
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
