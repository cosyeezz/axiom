// 限额独立于模型连接配置保存；不将调度字段写入 SDK 模型定义。
export function createModelLimits({ providerId, models, request }) {
  const el = (tag, text) => { const node = document.createElement(tag); if (text) node.textContent = text; return node; };
  const root = el("details");
  root.append(el("summary", "并发与限流配置"));
  root.append(el("p", "供应商总并发与模型并发同时生效；0 表示不限。RPM 按 HTTP 尝试计数。保存后对后续请求生效；排队或租约超时仍按故障放行策略处理。"));
  const status = el("p"); status.setAttribute("role", "status");
  const form = el("form");
  const load = el("button", "读取限额"); load.type = "button";
  root.append(load, status, form);
  const input = (label, value) => {
    const wrap = el("label", label); const field = el("input");
    field.type = "number"; field.min = "0"; field.max = "100000"; field.step = "1"; field.required = true;
    field.value = String(value ?? 0); wrap.append(field); form.append(wrap); return field;
  };
  load.onclick = async () => {
    load.disabled = true; status.textContent = "正在读取…";
    try {
      const data = await request("usage.get", { limit: 1 });
      const original = data.limits[providerId] ?? {};
      form.replaceChildren();
      const concurrency = input("供应商总并发", original.concurrency);
      const rpm = input("供应商 RPM", original.rpm);
      const ids = [...new Set([...models.map(model => model.id), ...Object.keys(original.models ?? {})])];
      const fields = ids.map(id => [id, input(`模型 ${id} 并发`, original.models?.[id]?.concurrency)]);
      const save = el("button", "保存限额"); save.type = "submit"; form.append(save);
      form.onsubmit = async event => {
        event.preventDefault();
        if (!form.reportValidity()) return;
        save.disabled = true;
        try {
          const latest = await request("usage.get", { limit: 1 });
          if (JSON.stringify(latest.limits[providerId] ?? {}) !== JSON.stringify(original)) throw new Error("该供应商限额已被其他窗口修改，请重新读取后编辑");
          await request("usage.configure", { limits: { ...latest.limits, [providerId]: {
            concurrency: Number(concurrency.value), rpm: Number(rpm.value),
            models: Object.fromEntries(fields.map(([id, field]) => [id, { concurrency: Number(field.value) }])),
          } } });
          status.textContent = "限额已保存";
          Object.assign(original, { concurrency: Number(concurrency.value), rpm: Number(rpm.value), models: Object.fromEntries(fields.map(([id, field]) => [id, { concurrency: Number(field.value) }])) });
        } catch (error) { status.textContent = `保存失败：${error.message}`; }
        finally { save.disabled = false; }
      };
      status.textContent = "已读取当前限额";
    } catch (error) { status.textContent = `读取失败：${error.message}`; }
    finally { load.disabled = false; }
  };
  return root;
}
