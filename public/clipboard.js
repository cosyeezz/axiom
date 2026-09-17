// 统一复制入口：所有“复制到剪贴板”都走这里。
// 远程 HTTP（非安全上下文）里 navigator.clipboard 为 undefined，直连 writeText 会抛
// “Cannot read properties of undefined (reading 'writeText')”；writeText 被拒绝
// （如 Firefox 权限门控）时也仍在用户手势窗口内，一律回退 execCommand。
export async function copyText(text, view = window) {
  const clipboard = view?.navigator?.clipboard;
  if (clipboard?.writeText) {
    try { await clipboard.writeText(text); return; }
    catch { /* 权限拒绝等：仍在用户手势窗口内，继续尝试 execCommand。 */ }
  }
  const doc = view?.document;
  if (!doc?.body) throw new Error("当前页面无法访问剪贴板");
  const active = doc.activeElement;
  const area = doc.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.top = "-9999px";
  doc.body.appendChild(area);
  area.select();
  let ok = false;
  try { ok = doc.execCommand("copy"); }
  catch { ok = false; } // jsdom 等环境未实现 execCommand；按复制失败处理。
  finally { area.remove(); active?.focus?.(); }
  if (!ok) throw new Error("浏览器拒绝了复制请求，请改用系统复制菜单");
}
