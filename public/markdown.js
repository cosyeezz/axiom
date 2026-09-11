import { marked } from "./vendor/marked.js";
import DOMPurify from "./vendor/purify.js";

const cache = new WeakMap();
const policy = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: ["img", "video", "audio", "form", "input", "button", "style"],
  FORBID_ATTR: ["style"],
};

export function renderMarkdown(element, text = "") {
  const previous = cache.get(element);
  if (previous?.text === text) return;
  // Lex the whole document: late reference definitions can change earlier blocks.
  // Only parse/sanitize/replace changed blocks, preserving completed DOM and selection.
  const tokens = marked
    .lexer(text, { gfm: true })
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
    for (const pre of node.querySelectorAll("pre:has(code)")) {
      const code = pre.querySelector("code");
      const language = [...code.classList].find((name) => name.startsWith("language-"))?.slice(9) || "纯文本";
      const block = element.ownerDocument.createElement("div");
      block.className = "code-block";
      const bar = element.ownerDocument.createElement("div");
      bar.className = "code-toolbar";
      const label = element.ownerDocument.createElement("span");
      label.textContent = language;
      const copy = element.ownerDocument.createElement("button");
      copy.type = "button";
      copy.textContent = "复制";
      copy.setAttribute("aria-label", "复制代码");
      copy.setAttribute("aria-live", "polite");
      copy.onclick = async () => {
        try {
          await element.ownerDocument.defaultView.navigator.clipboard.writeText(code.textContent);
          copy.textContent = "已复制";
        } catch { copy.textContent = "复制失败，请选中复制"; }
        copy.onblur = () => { copy.textContent = "复制"; };
      };
      bar.append(label, copy);
      pre.before(block);
      block.append(bar, pre);
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
