// DOM-only rendering: model text and JSON never become HTML.
const detailElement = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
export const money = value => !Number.isFinite(value) ? "未计价" : value === 0 ? "$0.00" : value < .001 ? "<$0.001" : `$${value.toFixed(3)}`;
const precise = value => Number.isFinite(value) ? `$${value.toFixed(6)}` : "未计价";
const count = value => (value ?? 0).toLocaleString("en-US");

export function jsonTree(value, label = "JSON", depth = 0) {
  if (value !== null && typeof value === "object") {
    const details = detailElement("details", "json-tree");
    details.open = depth < 1;
    const summary = detailElement("summary");
    summary.append(detailElement("span", "json-key", label), detailElement("span", "json-shape", Array.isArray(value) ? `[${value.length}]` : `{${Object.keys(value).length}}`));
    details.append(summary);
    for (const [key, child] of Object.entries(value)) details.append(jsonTree(child, key, depth + 1));
    return details;
  }
  const row = detailElement("div", "json-leaf");
  row.append(detailElement("span", "json-key", `${label}: `), detailElement("span", `json-${value === null ? "null" : typeof value}`, JSON.stringify(value) ?? "undefined"));
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
      const next = event.key === "ArrowRight" ? tabs[(index + 1) % tabs.length] : event.key === "ArrowLeft" ? tabs[(index + tabs.length - 1) % tabs.length] : event.key === "Home" ? tabs[0] : event.key === "End" ? tabs.at(-1) : null;
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
    node.append(detailElement("p", "detail-empty", tools ? "当前没有激活工具。" : "工具信息尚未加载。"));
    return;
  }
  const filter = detailElement("input", "tool-filter");
  filter.type = "search";
  filter.placeholder = `查找 ${tools.length} 个工具`;
  filter.setAttribute("aria-label", "查找工具");
  node.append(filter);
  const cards = tools.map(tool => {
    const card = detailElement("details", "inspector-tool");
    const title = detailElement("summary");
    title.append(detailElement("code", "tool-name", tool.name), detailElement("span", "tool-brief", tool.description?.split("\n")[0] ?? ""));
    const body = detailElement("div", "tool-definition");
    body.append(detailElement("p", "tool-description", tool.description), detailElement("div", "detail-eyebrow", "参数定义"), jsonTree(tool.parameters ?? {}, "schema"));
    card.append(title, body);
    node.append(card);
    return { card, text: `${tool.name} ${tool.description}`.toLowerCase() };
  });
  filter.addEventListener("input", () => cards.forEach(({ card, text }) => { card.hidden = !text.includes(filter.value.trim().toLowerCase()); }));
}

function costTable(bill) {
  const table = detailElement("table", "bill-table");
  const header = detailElement("thead");
  const row = detailElement("tr");
  for (const label of ["用量类型", "Tokens", "金额 · USD"]) row.append(detailElement("th", null, label));
  header.append(row); table.append(header);
  const body = detailElement("tbody");
  const tokens = bill.groups.reduce((total, group) => {
    for (const key of ["input", "output", "cacheRead", "cacheWrite"]) total[key] = (total[key] ?? 0) + (group.tokens[key] ?? 0);
    return total;
  }, {});
  for (const [key, label] of [["input", "输入"], ["output", "输出"], ["cacheRead", "缓存读取"], ["cacheWrite", "缓存写入"]]) {
    const tr = detailElement("tr");
    tr.append(detailElement("td", null, label), detailElement("td", null, count(tokens[key])), detailElement("td", null, precise(bill.cost[key])));
    body.append(tr);
  }
  table.append(body);
  return table;
}

export function renderBill(node, bill, { compact = false } = {}) {
  const signature = JSON.stringify(bill ?? null);
  if (node.dataset.bill === signature) return;
  node.dataset.bill = signature;
  node.replaceChildren();
  if (!bill) {
    node.append(detailElement("p", "detail-empty", "收到模型用量后显示账单"));
    return;
  }
  const overview = detailElement("div", "bill-overview");
  const total = detailElement("div", "bill-total");
  total.append(detailElement("span", "detail-eyebrow", compact ? "本任务费用" : "会话总费用"), detailElement("strong", null, money(bill.cost.total)), detailElement("span", "bill-currency", "USD · 估算"));
  total.title = precise(bill.cost.total);
  overview.append(total);
  const counts = detailElement("div", "bill-counts");
  counts.append(detailElement("span", null, `${bill.records} 条用量记录`));
  if (bill.agents) counts.append(detailElement("span", null, `${bill.agents.filter(a => a.id !== "main").length} 个子代理`));
  if (bill.unpriced || bill.incomplete) counts.append(detailElement("span", "bill-warning", "部分用量或价格缺失"));
  overview.append(counts); node.append(overview);
  if (bill.agents) {
    const list = detailElement("div", "bill-agents");
    for (const agent of bill.agents) {
      const row = detailElement("details", "bill-agent");
      const summary = detailElement("summary");
      const name = detailElement("span", "bill-agent-name");
      name.append(detailElement("span", null, agent.id === "main" ? "主代理" : agent.task || agent.id), detailElement("small", null, agent.id === "main" ? "主会话" : `子代理 · ${agent.id}`));
      summary.append(name, detailElement("span", "bill-agent-amount", agent.billing ? money(agent.billing.cost.total) : "未报告"));
      row.append(summary);
      if (agent.billing) row.append(costTable(agent.billing));
      else row.append(detailElement("p", "detail-empty", "该任务暂无可恢复的用量记录"));
      list.append(row);
    }
    node.append(list);
  } else node.append(costTable(bill));
  const models = detailElement("details", "bill-models");
  models.append(detailElement("summary", null, `按模型查看 · ${bill.groups.length}`));
  for (const group of bill.groups) {
    const card = detailElement("details", "bill-model");
    const summary = detailElement("summary");
    summary.append(detailElement("span", null, group.model), detailElement("span", null, money(group.cost.total)));
    card.append(summary, costTable({ groups: [group], cost: group.cost }));
    models.append(card);
  }
  node.append(models);
  const note = detailElement("details", "bill-note");
  note.append(detailElement("summary", null, "计费说明"), detailElement("p", null, `${compact ? "仅统计本任务用量" : "汇总主代理与全部子代理用量"}，按请求时记录的模型价格估算，不等于供应商扣款。修改价格不追溯历史；零金额可能表示未配置价格。输入与缓存用量分开统计。`));
  node.append(note);
}
