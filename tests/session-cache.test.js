import test from "node:test";
import assert from "node:assert/strict";
import { createSessionCache, EVICTABLE_VIEWS } from "../public/session-cache.js";

// 位置类视图（只有滚动/跟随，没有用户没保存的输入）：可淘汰。
const clean = (scroll = 0) => ({ draft: "", contextFiles: [], images: [], selectedSkill: "", follow: true, scroll });
const withDraft = (draft = "半句话") => ({ ...clean(10), draft });
const withImages = () => ({ ...clean(20), images: [{ type: "image", mimeType: "image/png", data: "AAA" }] });

test("Map 兼容面：get/set/has/delete/clear/keys/values", () => {
  const views = createSessionCache();
  assert.equal(views.get("a"), undefined);
  assert.equal(views.has("a"), false);
  const view = clean(42);
  assert.equal(views.set("a", view), views, "set 返回缓存本身，与 Map 一致");
  assert.equal(views.get("a"), view);
  assert.equal(views.has("a"), true);
  assert.deepEqual([...views.keys()], ["a"]);
  assert.deepEqual([...views.values()], [view]);
  assert.equal(views.delete("a"), true);
  assert.equal(views.delete("a"), false);
  views.set("b", clean()).set("c", clean());
  views.clear();
  assert.deepEqual([...views.keys()], []);
  assert.equal(views.has("b"), false);
});

test("get 返回对象本体：就地 mutation 立即生效，不需要再 set", () => {
  const views = createSessionCache();
  views.set("a", withDraft("旧"));
  // app.js 现状：views.get(id).draft = ... / .images = ... 直接改对象。
  views.get("a").draft = "新草稿";
  views.get("a").images = withImages().images;
  assert.equal(views.get("a").draft, "新草稿");
  assert.equal(views.get("a").images.length, 1);
  assert.notEqual(views.get("a"), withDraft("旧"), "不是每次 get 新建的副本");
});

test("可淘汰视图最多 3 条，按 LRU 淘汰最旧", () => {
  const views = createSessionCache();
  assert.equal(EVICTABLE_VIEWS, 3);
  for (const id of ["s1", "s2", "s3", "s4"]) views.set(id, clean(100 + Number(id.slice(1))));
  assert.deepEqual([...views.keys()], ["s2", "s3", "s4"], "第 4 条挤掉最旧的 s1（scroll 记忆可丢）");
  assert.deepEqual([...views.keys()].slice(1).map((id) => views.get(id).scroll), [103, 104]);
  // 重新 set 老会话 = 刷新 recency：s2 变成最新，下一次淘汰轮到 s3。
  views.set("s2", clean(102));
  views.set("s5", clean(105));
  assert.deepEqual([...views.keys()], ["s4", "s2", "s5"]);
});

test("草稿/附件/选中技能钉住：不被 LRU 挤掉，条数不限（非硬全量有界）", () => {
  const views = createSessionCache();
  for (const id of ["d1", "d2", "d3", "d4", "d5"]) views.set(id, withDraft(`草稿 ${id}`));
  for (const id of ["c1", "c2", "c3", "c4", "c5"]) views.set(id, clean());
  // 5 条草稿全部留着，超出 3 条上限也不淘汰：这是刻意的"草稿例外"。
  assert.deepEqual([...views.keys()].filter((id) => id.startsWith("d")), ["d1", "d2", "d3", "d4", "d5"]);
  assert.deepEqual([...views.keys()].filter((id) => id.startsWith("c")), ["c3", "c4", "c5"], "可淘汰的仍是 3 条");
  assert.equal(views.get("d1").draft, "草稿 d1");
  assert.deepEqual(views.stats(), { total: 8, evictable: 3, pinned: 5 });
});

test("附件、上下文文件、选中技能各自都能钉住视图", () => {
  const cases = [
    withImages(),
    { ...clean(), contextFiles: ["/repo/a.js"] },
    { ...clean(), selectedSkill: "codebase-map" },
  ];
  const views = createSessionCache();
  cases.forEach((view, index) => views.set(`p${index}`, view));
  for (const id of ["c1", "c2", "c3", "c4"]) views.set(id, clean());
  for (let index = 0; index < cases.length; index++) assert.equal(views.has(`p${index}`), true);
  assert.equal(views.get("p0").images[0].data, "AAA");
  assert.deepEqual(views.get("p1").contextFiles, ["/repo/a.js"]);
  assert.equal(views.get("p2").selectedSkill, "codebase-map");
  assert.equal(views.stats().evictable, 3);
});

test("草稿清空后再 set 一次即可回收", () => {
  const views = createSessionCache();
  views.set("a", withDraft("待发送"));
  for (const id of ["c1", "c2", "c3"]) views.set(id, clean());
  assert.equal(views.has("a"), true);
  // app.js 发送后：草稿/附件已清空，就地把对象改成"干净"的，下次 saveView 的 set 让它可以被淘汰。
  const view = views.get("a");
  view.draft = "";
  views.set("a", view);
  // 这一 set 就重算归属并在同一轮补足上限：a 变成可淘汰且是最新的，最旧的 c1 被挤掉。
  assert.deepEqual(views.stats(), { total: 3, evictable: 3, pinned: 0 });
  assert.equal(views.has("a"), true);
  assert.equal(views.has("c1"), false);
  for (const id of ["c4", "c5"]) views.set(id, clean());
  assert.equal(views.has("a"), true, "a 刚 set 过，比 c2/c3 新");
  assert.deepEqual([...views.keys()], ["a", "c4", "c5"]);
});

test("delete 掉的会话不会留下钉住的幽灵，也不会误伤别的视图", () => {
  const views = createSessionCache();
  views.set("gone", withDraft("会随会话删除一起走"));
  views.set("keep", withDraft("留着"));
  assert.equal(views.delete("gone"), true);
  assert.deepEqual(views.stats(), { total: 1, evictable: 0, pinned: 1 });
  for (const id of ["c1", "c2", "c3"]) views.set(id, clean());
  assert.equal(views.has("keep"), true);
  assert.equal(views.stats().evictable, 3, "删掉的钉住条目不再占用名额");
  assert.deepEqual(new Set(views.keys()), new Set(["keep", "c1", "c2", "c3"]));
});

test("自定义上限：0 表示不留可淘汰视图，只留未保存输入", () => {
  const views = createSessionCache(0);
  views.set("a", clean());
  views.set("b", withDraft());
  assert.equal(views.has("a"), false);
  assert.equal(views.has("b"), true);
});
