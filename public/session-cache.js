// 会话视图缓存：替代 app.js 里的 views Map。
// 视图分两类：
//   1. 位置类（scroll/follow 等，无用户输入）——可淘汰，只保留最近 maxEvictable(3) 条，超出按 set 顺序淘汰最旧。
//   2. 未保存输入（draft/contextFiles/images/selectedSkill）——钉住不淘汰。
// 钉住的条数不限：这是"草稿例外"，不是"全量有界"——带草稿的会话越多，占用越大，这是刻意的取舍
// （丢草稿比多占内存严重）。只 set 时才重算归属：调用方就地改完对象再 set 一次，即可让视图重新可淘汰。
export const EVICTABLE_VIEWS = 3;

const hasUnsavedInput = (view) => Boolean(view?.draft || view?.contextFiles?.length || view?.images?.length || view?.selectedSkill);

export function createSessionCache(maxEvictable = EVICTABLE_VIEWS) {
  const entries = new Map(); // id -> 视图对象；插入顺序即最近使用顺序（见 set）。
  const pinned = new Set(); // 带未保存输入的 id；始终是 entries 的子集。
  const cache = {
    // get 返回库里那个可写对象本体，不复制：app.js 有就地改 view.images / view.draft 的调用点。
    get: (id) => entries.get(id),
    has: (id) => entries.has(id),
    set(id, view) {
      if (hasUnsavedInput(view)) pinned.add(id);
      else pinned.delete(id);
      // 先删后插 = 重新 set 即刷新最近使用顺序（Map 的 get 不改顺序，故只在 set 时记 recency）。
      entries.delete(id);
      entries.set(id, view);
      evict();
      return cache;
    },
    delete(id) {
      pinned.delete(id);
      return entries.delete(id);
    },
    clear() {
      entries.clear();
      pinned.clear();
    },
    keys: () => entries.keys(),
    values: () => entries.values(),
    // 只读诊断用，不参与 app 语义。
    stats: () => ({ total: entries.size, evictable: entries.size - pinned.size, pinned: pinned.size }),
  };
  // pinned ⊆ entries 保证 entries.size - pinned.size 就是可淘汰条数，不用另外计数。
  function evict() {
    while (entries.size - pinned.size > maxEvictable) {
      let victim;
      for (const id of entries.keys()) {
        if (!pinned.has(id)) { victim = id; break; }
      }
      if (victim === undefined) return; // 全是钉住的：草稿不淘汰。
      entries.delete(victim);
    }
  }
  return cache;
}
