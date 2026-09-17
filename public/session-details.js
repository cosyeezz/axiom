// 所有动态内容使用 textContent，模型返回的 schema 不能成为 HTML。
export function jsonTree(value, label = "JSON", depth = 0) {
  if (value !== null && typeof value === "object") {
    const details = document.createElement("details");
    details.className = "json-tree";
    details.open = depth < 1;
    const summary = document.createElement("summary");
    summary.textContent = `${label} ${Array.isArray(value) ? `[${value.length}]` : `{${Object.keys(value).length}}`}`;
    details.append(summary);
    for (const [key, child] of Object.entries(value)) details.append(jsonTree(child, key, depth + 1));
    return details;
  }
  const row = document.createElement("div");
  row.className = "json-leaf";
  const key = document.createElement("span");
  key.className = "json-key";
  key.textContent = `${label}: `;
  const token = document.createElement("span");
  token.className = `json-${value === null ? "null" : typeof value}`;
  token.textContent = JSON.stringify(value) ?? "undefined";
  row.append(key, token);
  return row;
}

export function initInspector(root) {
  const tabs = [...root.querySelectorAll('[role="tab"]')];
  function select(tab) {
    for (const item of tabs) {
      const active = item === tab;
      item.setAttribute("aria-selected", String(active));
      item.tabIndex = active ? 0 : -1;
      document.getElementById(item.getAttribute("aria-controls")).hidden = !active;
    }
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => select(tab));
    tab.addEventListener("keydown", event => {
      let next;
      if (event.key === "ArrowRight") next = tabs[(index + 1) % tabs.length];
      if (event.key === "ArrowLeft") next = tabs[(index + tabs.length - 1) % tabs.length];
      if (event.key === "Home") next = tabs[0];
      if (event.key === "End") next = tabs.at(-1);
      if (next) { event.preventDefault(); select(next); next.focus(); }
    });
  });
}

export function renderTools(node, tools) {
  const signature = JSON.stringify(tools ?? null);
  if (node.dataset.content === signature) return;
  node.dataset.content = signature;
  node.replaceChildren();
  if (!Array.isArray(tools) || !tools.length) {
    node.textContent = tools ? "当前没有激活工具。" : "工具信息尚未加载。";
    return;
  }
  for (const tool of tools) {
    const card = document.createElement("details");
    card.className = "inspector-tool";
    const title = document.createElement("summary");
    title.textContent = tool.name;
    const description = document.createElement("p");
    description.textContent = tool.description;
    card.append(title, description, jsonTree(tool.parameters ?? {}, "参数"));
    node.append(card);
  }
}

export const money = value => Number.isFinite(value) ? `$${value.toFixed(6)}` : "未计价";
export function renderBill(node, bill) {
  node.replaceChildren();
  const note = document.createElement("p");
  note.textContent = "USD · 按请求时记录的模型价格估算，非供应商扣款账单。包含本会话主代理、工具及摘要记录，不含独立委托会话；修改价格不追溯历史。零费用也可能源于模型未配置价格，请核对模型设置。";
  node.append(note);
  if (!bill?.records) {
    const empty = document.createElement("p");
    empty.textContent = "尚无已报告用量的请求。";
    node.append(empty);
    return;
  }
  const total = document.createElement("strong");
  total.textContent = `会话合计 ${money(bill.cost.total)} · ${bill.records} 条用量记录${bill.unpriced ? ` · ${bill.unpriced} 条未计价` : ""}`;
  node.append(total);
  for (const group of bill.groups) {
    const card = document.createElement("details");
    card.className = "bill-model";
    const summary = document.createElement("summary");
    summary.textContent = `${group.model} · ${money(group.cost.total)}`;
    card.append(summary);
    const list = document.createElement("dl");
    for (const [key, label] of [["input", "输入"], ["output", "输出"], ["cacheRead", "缓存读取"], ["cacheWrite", "缓存写入"]]) {
      const term = document.createElement("dt");
      term.textContent = label;
      const value = document.createElement("dd");
      value.textContent = `${group.tokens[key].toLocaleString("en-US")} tokens · ${money(group.cost[key])}`;
      list.append(term, value);
    }
    card.append(list);
    node.append(card);
  }
}
