// Only transform the model-facing copy; drafts, persisted messages and queues keep attachment order.
export function inlineImages(message) {
  if (message.role !== "user" || !Array.isArray(message.content)) return message;
  const images = message.content.filter((block) => block.type === "image");
  if (!images.length) return message;
  // SDK input shape is [text, ...images]. Leave already-interleaved messages alone.
  const firstImage = message.content.findIndex((block) => block.type === "image");
  if (message.content.slice(firstImage).some((block) => block.type !== "image")) return message;
  const used = new Set(), content = [];
  for (const block of message.content.slice(0, firstImage)) {
    if (block.type !== "text") { content.push(block); continue; }
    let start = 0;
    for (const match of block.text.matchAll(/\[image([1-9]\d*)\]/g)) {
      const index = Number(match[1]) - 1;
      if (!images[index] || used.has(index)) continue;
      const end = match.index + match[0].length;
      content.push({ type: "text", text: block.text.slice(start, end) }, images[index]);
      used.add(index);
      start = end;
    }
    if (start < block.text.length) content.push({ ...block, text: block.text.slice(start) });
  }
  images.forEach((image, index) => {
    if (!used.has(index)) content.push({ type: "text", text: `[image${index + 1}]` }, image);
  });
  return { ...message, content };
}

export function inlineImagesExtension(pi) {
  pi.on("context", ({ messages }) => ({ messages: messages.map(inlineImages) }));
}
