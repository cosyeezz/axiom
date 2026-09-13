// public/file-picker.js — 原生 JS 可复用文件选择组件（无依赖、无框架）。
// 主题：完全依赖 style.css 的 :root 变量（--canvas/--surface/--raised/--line/--ink/--muted/--accent），
// 深/浅主题切换只需覆盖变量，本组件自动适配。样式见 file-picker.css。
//
// 用法：
//   const picker = createFilePicker(request);          // request 即 app.js 的 (type, data) => Promise
//   const entry = await picker.open({ title, sessionId?, path?, mode: 'file' | 'folder' }); // 取消得 null
//   picker.close();
//   fileIcon(entry) -> SVG DOM 节点（也可独立使用）。

const NS = "http://www.w3.org/2000/svg";
const SEARCH_DEBOUNCE = 300;

// ---------- 微型 DOM 辅助（全部 textContent/setAttribute，绝不 innerHTML） ----------

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) n.setAttribute(k, v === true ? "" : String(v));
  }
  for (const kid of kids) n.append(kid);
  return n;
}

// ---------- 自绘图标（SVG，按类型区分颜色与形状） ----------

const FOLDER_COLORS = { src: "#2fa8a0", test: "#4caf6d", docs: "#4f8fd0", ".git": "#e0854a", node_modules: "#8d8f9a" };
const FOLDER_ALIASES = { tests: "test", spec: "test", specs: "test", doc: "docs", documentation: "docs" };
const FOLDER_COLOR = "#9a86e8"; // 普通目录
const FOLDER_BASE = "M3 7c0-1.1.9-2 2-2h4.6L11.7 7H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z";
const DOC_BASE = ["M5.5 3h8.2l4.8 4.8V21h-13z", "M13.7 3v4.8h4.8"];

const p = (d) => ["path", { d }];
const c = (cx, cy, r) => ["circle", { cx, cy, r }];
const t = (str, x, y, size) => [
  "text",
  { x, y, "text-anchor": "middle", "font-size": size, "font-family": "ui-monospace,Consolas,monospace", "font-weight": "700", fill: "currentColor", stroke: "none" },
  str,
];

const FOLDER_GLYPHS = {
  src: [p("M11.4 13.2 9.8 15l1.6 1.8M12.9 13.2l1.6 1.8-1.6 1.8")],
  test: [p("m9.6 14.8 1.9 1.9 3.3-3.8")],
  docs: [p("M9.2 13.8h5.6M9.2 16.2h3.6")],
  ".git": [c(9.4, 13.6, 1.2), c(14.6, 13.6, 1.2), p("M9.4 14.8v.6c0 1.4 1.3 1.9 2.6 1.9s2.6-.5 2.6-1.9v-.6")],
  node_modules: [p("M9.4 12.6h5.2v4.6H9.4z"), p("M9.4 14.9h5.2")],
};

const FILE_GLYPHS = {
  code: [p("M10.2 11.4 7.9 13.8l2.3 2.4"), p("M13.8 11.4l2.3 2.4-2.3 2.4")],
  json: [t("{ }", 12, 15.8, 6.5)],
  md: [p("M8 16.5v-5.2l2.4 2.9 2.4-2.9v5.2"), p("M15.3 10.8v5.4m-1.7-1.7 1.7 1.7 1.7-1.7")],
  text: [p("M8.5 12.3h7M8.5 15.3h4.5")],
  image: [c(10, 11.6, 1.3), p("M8 17.2l2.8-2.8 1.7 1.7 2-2.4 1.5 1.9")],
  audio: [p("M10.7 16.4v-4.7l4.3-.9v4.4"), c(9.4, 16.4, 1.3), c(13.7, 15.2, 1.3)],
  video: [["path", { d: "M10.6 10.8v6.4l5.2-3.2z", fill: "currentColor", stroke: "none" }]],
  archive: [p("M12 8.6v1.6m0 1.8v1.6m0 1.8v1.6"), p("M10.6 17.8h2.8")],
  pdf: [t("PDF", 12, 15.8, 5.6)],
  font: [t("A", 12, 16.2, 8.5)],
  default: [p("M8.5 12.3h7M8.5 15.3h7")],
};

const KIND_BY_EXT = {};
for (const e of ["js", "mjs", "cjs", "jsx"]) KIND_BY_EXT[e] = { kind: "code", color: "#d19a1f" };
for (const e of ["ts", "mts", "cts", "tsx"]) KIND_BY_EXT[e] = { kind: "code", color: "#3f7fd0" };
for (const e of ["html", "htm", "xml", "vue", "svelte"]) KIND_BY_EXT[e] = { kind: "code", color: "#e0854a" };
for (const e of ["css", "scss", "sass", "less"]) KIND_BY_EXT[e] = { kind: "code", color: "#9a86e8" };
for (const e of ["go", "rs", "java", "c", "h", "cpp", "cs", "sh", "ps1", "rb", "php", "swift", "kt"]) KIND_BY_EXT[e] = { kind: "code", color: "#2fa8a0" };
for (const e of ["py", "pyi", "pyw"]) KIND_BY_EXT[e] = { kind: "code", color: "#43a05c" };
for (const e of ["json", "jsonc", "json5", "toml", "yaml", "yml", "ini", "cfg", "conf", "env", "lock", "properties"]) KIND_BY_EXT[e] = { kind: "json", color: "#2f9e8f" };
for (const e of ["md", "markdown", "mdx"]) KIND_BY_EXT[e] = { kind: "md", color: "#4d8fd1" };
for (const e of ["txt", "log", "text"]) KIND_BY_EXT[e] = { kind: "text", color: "#989aa6" };
for (const e of ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif", "tif", "tiff", "heic"]) KIND_BY_EXT[e] = { kind: "image", color: "#c264c8" };
for (const e of ["mp3", "wav", "ogg", "oga", "flac", "m4a", "aac", "opus"]) KIND_BY_EXT[e] = { kind: "audio", color: "#d05a7e" };
for (const e of ["mp4", "webm", "mkv", "avi", "mov", "m4v", "mpg", "wmv"]) KIND_BY_EXT[e] = { kind: "video", color: "#9a5cd0" };
for (const e of ["zip", "tar", "gz", "tgz", "bz2", "xz", "7z", "rar", "zst"]) KIND_BY_EXT[e] = { kind: "archive", color: "#c2803a" };
KIND_BY_EXT.pdf = { kind: "pdf", color: "#d04545" };
for (const e of ["ttf", "otf", "woff", "woff2", "eot"]) KIND_BY_EXT[e] = { kind: "font", color: "#708ad8" };

function kindOf(entry) {
  if (entry?.directory) {
    const name = String(entry.name || "").toLowerCase();
    const key = FOLDER_ALIASES[name] || name;
    return { color: FOLDER_COLORS[key] ?? FOLDER_COLOR, glyphs: FOLDER_GLYPHS[key] ?? [], base: "folder" };
  }
  const ext = String(entry?.name || "").split(".").pop().toLowerCase();
  const k = KIND_BY_EXT[ext] ?? { kind: "default", color: "#989aa6" };
  return { color: k.color, glyphs: FILE_GLYPHS[k.kind], base: "doc" };
}

/** 返回一个 SVG DOM 节点，颜色/形状按 entry 类型区分（本地自绘，无外部资源）。 */
export function fileIcon(entry) {
  const info = kindOf(entry);
  const svg = document.createElementNS(NS, "svg");
  for (const [k, v] of Object.entries({
    viewBox: "0 0 24 24", class: "fp-icon", "aria-hidden": "true",
    fill: "none", stroke: "currentColor", "stroke-width": "1.6",
    "stroke-linecap": "round", "stroke-linejoin": "round",
  })) svg.setAttribute(k, v);
  svg.setAttribute("color", info.color);
  const parts = info.base === "folder" ? [p(FOLDER_BASE), ...info.glyphs] : [...DOC_BASE.map(p), ...info.glyphs];
  for (const [tag, attrs, text] of parts) {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (text != null) n.textContent = text;
    svg.append(n);
  }
  return svg;
}

// ---------- 组件 ----------

export function createFilePicker(request) {
  let gen = 0; // 竞态令牌：open/close/导航/搜索/刷新都自增，过期回包直接丢弃
  let settled = false, resolveOpen = null, prevFocus = null;
  let mode = "file", sessionId;
  let currentPath = "", parent = null, nextOffset = null, selected = null, lastCall = null;
  let searchTimer = 0, validDirectory = false;

  let pathInput, upBtn, refreshBtn, crumbsEl, locationsEl, searchInput, resultsEl, moreBtn, statusEl, selectionEl, confirmBtn, titleEl;

  const dialog = el("dialog", { id: "file-picker", class: "fp-dialog", "aria-labelledby": "file-picker-title" },
    el("div", { class: "fp-shell" },
      el("header", { class: "fp-head" },
        titleEl = el("h2", { id: "file-picker-title", class: "fp-title" }, "选择文件"),
        el("button", { id: "file-picker-close", type: "button", class: "fp-iconbtn", "aria-label": "关闭", title: "关闭", onclick: () => settle(null) }, "✕")),
      el("div", { class: "fp-toolbar" },
        pathInput = el("input", {
          id: "file-picker-path", type: "text", placeholder: "输入路径后按 Enter 打开", spellcheck: "false", autocomplete: "off", "aria-label": "路径",
          onkeydown: (e) => { if (e.key === "Enter") { e.preventDefault(); clearTimeout(searchTimer); navigate(e.currentTarget.value.trim()); } },
        }),
        upBtn = el("button", { id: "file-picker-up", type: "button", class: "fp-iconbtn", "aria-label": "上一级", title: "上一级", onclick: () => parent != null && navigate(parent) }, "↑"),
        refreshBtn = el("button", { id: "file-picker-refresh", type: "button", class: "fp-iconbtn", "aria-label": "刷新", title: "刷新", onclick: () => reload() }, "↻")),
      crumbsEl = el("nav", { id: "file-picker-crumbs", class: "fp-crumbs", "aria-label": "路径导航" }),
      el("div", { class: "fp-body" },
        el("div", { class: "fp-side" },
          el("h3", { class: "fp-side-title" }, "位置"),
          locationsEl = el("div", { id: "file-picker-locations", class: "fp-locations" })),
        el("section", { class: "fp-main" },
          searchInput = el("input", {
            id: "file-picker-search", type: "search", placeholder: "搜索文件或文件夹（含子目录）…", autocomplete: "off", "aria-label": "搜索文件或文件夹",
            oninput: () => { clearTimeout(searchTimer); gen++; validDirectory = false; selected = null; busy(true); updateFooter(); searchTimer = setTimeout(reload, SEARCH_DEBOUNCE); },
            onkeydown: (e) => { if (e.key === "Enter") { e.preventDefault(); clearTimeout(searchTimer); reload(); } },
          }),
          resultsEl = el("ul", { id: "file-picker-results", class: "fp-results", "aria-busy": "false" }),
          moreBtn = el("button", { id: "file-picker-more", type: "button", class: "fp-more", hidden: true, onclick: () => load(currentPath, lastCall.query, nextOffset, true) }, "加载更多"),
          statusEl = el("p", { id: "file-picker-status", class: "fp-status", role: "status", "aria-live": "polite" }))),
      el("footer", { class: "fp-foot" },
        selectionEl = el("div", { id: "file-picker-selection", class: "fp-selection", "aria-live": "polite" }, "未选择文件"),
        el("button", { id: "file-picker-cancel", type: "button", class: "fp-cancel", onclick: () => settle(null) }, "取消"),
        confirmBtn = el("button", { id: "file-picker-confirm", type: "button", class: "fp-confirm", onclick: onConfirm }, "确定"))));
  document.body.append(dialog);
  dialog.addEventListener("close", () => { if (!dialog.open) settle(null); });
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); settle(null); });
  dialog.addEventListener("click", (e) => { if (e.target === dialog) settle(null); }); // 点击遮罩关闭
  resultsEl.addEventListener("keydown", moveRowFocus);

  // ---- 加载与竞态 ----

  function load(path, query, offset, append) {
    if (!dialog.open) return;
    lastCall = { path, query, offset, append };
    validDirectory = false;
    if (!append) selected = null;
    updateFooter();
    const my = append ? gen : ++gen;
    if (!append) { resultsEl.replaceChildren(); moreBtn.hidden = true; }
    busy(true, append);
    request("files.browse", {
      ...(sessionId ? { sessionId } : {}),
      path, directoriesOnly: mode === "folder", offset, query,
    }).then(
      (res) => { if (my === gen && dialog.open) apply(res, append, query); },
      (err) => { if (my === gen && dialog.open) fail(err, append); },
    );
  }

  function apply(res, append, query) {
    busy(false);
    validDirectory = true;
    currentPath = res.path ?? currentPath;
    pathInput.value = currentPath;
    parent = res.parent ?? null;
    upBtn.disabled = parent == null;
    nextOffset = res.nextOffset ?? null;
    moreBtn.hidden = nextOffset == null;
    renderCrumbs(res.breadcrumbs || []);
    renderLocations(res.locations || []);
    if (!append) resultsEl.replaceChildren();
    for (const entry of res.entries || []) resultsEl.append(row(entry));
    if (!resultsEl.children.length) statusEl.textContent = query ? "没有匹配的结果" : "此目录为空";
    updateFooter();
  }

  function fail(err, append) {
    busy(false);
    if (!(append && resultsEl.children.length)) resultsEl.replaceChildren();
    statusEl.replaceChildren(`加载失败：${err?.message || err} `,
      el("button", { type: "button", class: "fp-retry", onclick: () => load(lastCall.path, lastCall.query, lastCall.offset, lastCall.append) }, "重试"));
  }

  function busy(on, append = false) {
    resultsEl.setAttribute("aria-busy", String(on));
    resultsEl.classList.toggle("fp-loading", on);
    moreBtn.disabled = on;
    if (on && !append) statusEl.textContent = "加载中…";
    else if (!on) statusEl.textContent = "";
  }

  function reload() { clearTimeout(searchTimer); load(currentPath, searchInput.value.trim(), 0, false); } // 刷新与搜索共用（保留 query）

  function navigate(path) { // 导航即清空搜索，过滤器只作用于发起它的目录
    clearTimeout(searchTimer);
    currentPath = path;
    pathInput.value = path;
    searchInput.value = "";
    selected = null;
    updateFooter();
    load(path, "", 0, false);
  }

  // ---- 渲染 ----

  function row(entry) {
    // 搜索命中来自递归结果，附上相对目录，避免父子目录里的同名文件无法区分。
    const at = String(entry.path ?? "").lastIndexOf("/");
    const dir = lastCall?.query && at > 0 ? entry.path.slice(0, at) : "";
    const name = el("span", { class: "fp-name" }, entry.name ?? entry.path);
    if (dir) name.append(el("span", { class: "fp-dir" }, `${dir}/`));
    const btn = el("button", { type: "button", class: "fp-row", title: dir ? entry.path : entry.name, ...(entry.directory ? {} : { "aria-pressed": "false" }) },
      fileIcon(entry), name);
    if (entry.directory) {
      btn.append(el("span", { class: "fp-row-arrow", "aria-hidden": "true" }, "›"));
      btn.addEventListener("click", () => navigate(entry.path));
    }
    else if (mode === "folder") { btn.disabled = true; btn.classList.add("fp-off"); }
    else {
      btn.addEventListener("click", () => { selected = entry; markSelected(btn); updateFooter(); });
      btn.addEventListener("dblclick", () => settle({ ...entry }));
    }
    return el("li", { class: "fp-item" }, btn);
  }

  function markSelected(btn) {
    for (const b of resultsEl.querySelectorAll(".fp-row.fp-active")) { b.classList.remove("fp-active"); b.setAttribute("aria-pressed", "false"); }
    btn.classList.add("fp-active");
    btn.setAttribute("aria-pressed", "true");
  }

  function renderCrumbs(list) {
    crumbsEl.replaceChildren();
    list.forEach((crumb, i) => {
      if (i) crumbsEl.append(el("span", { class: "fp-sep", "aria-hidden": "true" }, "›"));
      crumbsEl.append(el("button", {
        type: "button", class: "fp-crumb",
        "aria-current": i === list.length - 1 ? "location" : false,
        onclick: () => navigate(crumb.path),
      }, crumb.name));
    });
  }

  function renderLocations(list) {
    locationsEl.replaceChildren();
    for (const loc of list) {
      locationsEl.append(el("button", { type: "button", class: "fp-loc", title: loc.path, onclick: () => navigate(loc.path) }, loc.name));
    }
  }

  function moveRowFocus(e) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    const rows = [...resultsEl.querySelectorAll("button.fp-row:not(:disabled)")];
    if (!rows.length) return;
    e.preventDefault();
    const i = rows.indexOf(document.activeElement);
    const next = e.key === "ArrowDown" ? i + 1 : e.key === "ArrowUp" ? i - 1 : e.key === "Home" ? 0 : rows.length - 1;
    rows[Math.max(0, Math.min(next, rows.length - 1))].focus();
  }

  function updateFooter() {
    if (mode === "folder") {
      selectionEl.textContent = `当前目录：${currentPath || (sessionId ? "工作空间" : "/")}`;
      confirmBtn.disabled = !validDirectory;
    } else if (selected) {
      selectionEl.textContent = `已选择：${selected.path}`;
      confirmBtn.disabled = !validDirectory;
    } else {
      selectionEl.textContent = "未选择文件";
      confirmBtn.disabled = true;
    }
  }

  function onConfirm() {
    if (!validDirectory) return;
    if (mode === "folder") settle({ name: baseName(currentPath), path: currentPath, directory: true });
    else if (selected) settle({ ...selected });
  }

  function settle(value) {
    if (settled) return;
    settled = true;
    clearTimeout(searchTimer);
    gen++; // 迟到的回包一律作废
    if (dialog.open) dialog.close();
    if (prevFocus?.isConnected) prevFocus.focus();
    prevFocus = null;
    const resolve = resolveOpen;
    resolveOpen = null;
    resolve?.(value);
  }

  // ---- 对外接口 ----

  function open(opts = {}) {
    if (dialog.open) settle(null); // 重复 open 视为取消上一次
    clearTimeout(searchTimer);
    mode = opts.mode === "folder" ? "folder" : "file";
    sessionId = opts.sessionId;
    settled = false;
    titleEl.textContent = opts.title ?? (mode === "folder" ? "选择目录" : "选择文件");
    confirmBtn.textContent = mode === "folder" ? "选择当前目录" : "确定";
    dialog.classList.toggle("fp-folder", mode === "folder");
    crumbsEl.replaceChildren();
    locationsEl.replaceChildren();
    resultsEl.replaceChildren();
    statusEl.textContent = "";
    selected = null;
    validDirectory = false;
    nextOffset = null;
    parent = null;
    upBtn.disabled = true;
    moreBtn.hidden = true;
    currentPath = opts.path ?? "";
    pathInput.value = currentPath;
    searchInput.value = "";
    updateFooter();
    prevFocus = document.activeElement;
    dialog.showModal();
    searchInput.focus();
    return new Promise((resolve) => {
      resolveOpen = resolve;
      load(currentPath, "", 0, false);
    });
  }

  function close() { settle(null); }

  return { open, close };
}

function baseName(path) {
  return String(path || "").split(/[\\/]/).filter(Boolean).pop() || (path || "/");
}
