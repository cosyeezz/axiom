import test from "node:test";
import assert from "node:assert/strict";
import { inlineImages, inlineImagesExtension } from "../src/inline-images.js";

const text = (text) => ({ type: "text", text });
const a = { type: "image", mimeType: "image/png", data: "AA==" };
const b = { ...a, data: "AQ==" };
const user = (value, images = [a, b]) => ({ role: "user", content: [text(value), ...images], timestamp: 1 });

test("模型内容按占位位置交错，保留重复引用、无效标记及原消息", () => {
  const original = user("前[image2]中[image1]后[image2][image9]");
  const saved = structuredClone(original);
  const result = inlineImages(original);
  assert.deepEqual(result.content, [text("前[image2]"), b, text("中[image1]"), a, text("后[image2][image9]")]);
  assert.deepEqual(original, saved);
  assert.deepEqual(inlineImages(result), result);
  assert.deepEqual(inlineImages(user("[image1][image2]")).content, [text("[image1]"), a, text("[image2]"), b]);
  assert.deepEqual(inlineImages(user("[image1]", [a])).content, [text("[image1]"), a]);
});

test("漏标、纯图、普通文本及其他角色不丢内容、不串图", () => {
  assert.deepEqual(inlineImages(user("前[image2]后")).content, [text("前[image2]"), b, text("后"), text("[image1]"), a]);
  assert.deepEqual(inlineImages(user("", [a])).content, [text("[image1]"), a]);
  assert.deepEqual(inlineImages(user("[image0][image9]", [a])).content, [text("[image0][image9]"), text("[image1]"), a]);
  for (const message of [{ role: "user", content: "[image1]" }, user("[image1]", []), { ...user("[image1]"), role: "toolResult" }]) {
    assert.equal(inlineImages(message), message);
  }
});

test("context 钩子统一处理普通发送、队列消费和恢复历史的副本", () => {
  let handler;
  inlineImagesExtension({ on(name, fn) { assert.equal(name, "context"); handler = fn; } });
  const messages = [user("历史[image1]尾", [a]), user("插话[image1]后", [b])];
  const saved = structuredClone(messages);
  const result = handler({ messages }).messages;
  assert.deepEqual(result.map((m) => m.content), [
    [text("历史[image1]"), a, text("尾")],
    [text("插话[image1]"), b, text("后")],
  ]);
  assert.deepEqual(messages, saved);
});
