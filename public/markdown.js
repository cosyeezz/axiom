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
    if (old) old.node.replaceWith(node);
    else element.append(node);
    return { key, node };
  });
  for (const block of previous?.blocks.slice(blocks.length) || [])
    block.node.remove();
  cache.set(element, { text, blocks });
}
