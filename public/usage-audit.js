// 所有供应商/错误文本只经 textContent，审计数据不是 HTML。
export function createUsageAudit({ request, panel }) {
  const el = (tag, text) => { const node = document.createElement(tag); if (text != null) node.textContent = text; return node; };
  const title = el("h3", "用量与限流");
  const note = el("p", "请求记录长期保留。费用为模型配置价格估算，不等同于供应商实际扣款；缺失用量不能视为免费。");
  const status = el("p"); status.setAttribute("role", "status");
  const refresh = el("button", "刷新"); refresh.type = "button"; refresh.className = "secondary";
  const filters = el("form"); filters.className = "usage-filters";
  const input = (label, placeholder) => { const wrap = el("label", label); const field = el("input"); field.placeholder = placeholder; wrap.append(field); filters.append(wrap); return field; };
  const session = input("会话 ID", "留空查看全部会话");
  const provider = input("供应商", "留空查看全部供应商");
  const apply = el("button", "筛选"); filters.append(apply);
  const summary = el("div"); const live = el("div"); const rows = el("div");
  const next = el("button", "下一页"); next.type = "button"; next.className = "secondary"; next.hidden = true;
  const config = el("details"); config.append(el("summary", "供应商限流配置"));
  config.append(el("p", "纯 FIFO。RPM 按 HTTP 尝试计数；并发按完整请求计数。0 或未配置表示不限。WebSocket 请求无法统计 HTTP RPM。"));
  const editor = el("textarea"); editor.rows = 8; editor.setAttribute("aria-label", "供应商限流 JSON"); editor.spellcheck = false;
  const save = el("button", "保存限额"); save.type = "button";
  config.append(editor, save);
  const importHistory = el("button", "导入现存历史用量"); importHistory.type = "button"; importHistory.className = "secondary";
  config.append(el("p", "历史导入只恢复启用审计前仍存在的 JSONL 用量，自动去除副本重复；无法恢复已删除记录、HTTP 次数或排队耗时。"), importHistory);
  importHistory.onclick = async () => {
    importHistory.disabled = true;
    try { const result = await request("usage.backfill"); await load(); status.textContent = `已导入 ${result.imported}，重复 ${result.deduped}，跳过 ${result.skipped}，缺失文件 ${result.missing}`; }
    catch (error) { status.textContent = error.message; }
    finally { importHistory.disabled = false; }
  };
  panel.append(title, note, refresh, status, live, filters, summary, rows, next, config);
  let cursor = null, generation = 0, dirty = false;
  editor.oninput = () => { dirty = true; };
  const money = value => `$${Number(value ?? 0).toFixed(6)}`;
  function table(headers, values) {
    const box = el("div"); box.className = "usage-scroll";
    const table = el("table"); const head = el("thead"); const tr = el("tr");
    headers.forEach(text => tr.append(el("th", text))); head.append(tr); table.append(head);
    const body = el("tbody");
    for (const cells of values) { const row = el("tr"); cells.forEach(text => row.append(el("td", text))); body.append(row); }
    table.append(body); box.append(table); return box;
  }
  async function load(older = false) {
    const token = ++generation; status.textContent = "正在读取…";
    refresh.disabled = next.disabled = true;
    try {
      const data = await request("usage.get", { ...(session.value.trim() ? { sessionId: session.value.trim() } : {}), ...(provider.value.trim() ? { provider: provider.value.trim() } : {}), ...(older ? cursor : {}), limit: 50 });
      if (token !== generation) return;
      cursor = data.requests.nextCursor;
      if (!dirty) editor.value = JSON.stringify(data.limits, null, 2);
      live.replaceChildren(el("h4", "当前限流状态"), table(["供应商", "并发占用", "窗口尝试", "排队", "冷却", "超时放行"], data.gate.map(row => [row.provider, `${row.active} / ${row.concurrency || "不限"}`, `${row.attempts} / ${row.rpm || "不限"}`, row.concurrencyQueue + row.rpmQueue, `${Math.ceil(row.cooldownMs / 1000)}s`, row.bypassed])));
      summary.replaceChildren(el("h4", session.value.trim() ? "会话分账" : "全局每日汇总"), table([session.value.trim() ? "代理" : "日期", "供应商 / 模型", "请求", "输入", "输出", "缓存读", "缓存写", "费用（USD）"], data.billing.map(row => [row.agentId ?? row.day, `${row.provider ?? "未知"} / ${row.model ?? "未知"}`, row.records, row.input, row.output, row.cacheRead, row.cacheWrite, money(row.costTotal)])));
      rows.replaceChildren(el("h4", "请求明细"));
      for (const row of data.requests.items) {
        const item = el("details"); item.className = "usage-request";
        item.append(el("summary", `${new Date(row.queuedAt).toLocaleString()} · ${row.provider ?? "未知"}/${row.model ?? "未知"} · ${row.status} · ${money(row.costTotal)}`));
        item.append(table(["字段", "值"], Object.entries(row).map(([key, value]) => [key, value == null ? "未记录" : String(value)])));
        rows.append(item);
      }
      if (!data.requests.items.length) rows.append(el("p", "暂无请求记录。"));
      next.hidden = !cursor; status.textContent = `本页 ${data.requests.items.length} 条请求`;
    } catch (error) { if (token === generation) status.textContent = error.message; }
    finally { if (token === generation) refresh.disabled = next.disabled = false; }
  }
  refresh.onclick = () => void load(); next.onclick = () => void load(true);
  filters.onsubmit = event => { event.preventDefault(); void load(); };
  save.onclick = async () => {
    save.disabled = true;
    try { await request("usage.configure", { limits: JSON.parse(editor.value) }); dirty = false; await load(); }
    catch (error) { status.textContent = error.message; }
    finally { save.disabled = false; }
  };
  return { load };
}
