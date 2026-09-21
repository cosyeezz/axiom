// Composer artwork: 24px grid, 1.75px round strokes, >=1px safe area, r=2 corners.
// Monochrome throughout — hue never distinguishes one tool from another, because a
// multi-hue row reads as false hierarchy and carries no meaning for colour-blind users.
// Destructive intent is carried by button styling and wording, not by icon colour.
const artwork = Object.freeze({
  // 回形针：比裸 + 号更明确「附加上下文」，且与相邻矩形类图形区分。
  context: ['m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48'],
  // 图片：沿用原有「边框 + 山景 + 太阳」语汇，按 24 网格重排。
  image: ['M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4', 'm21 15-4-4a2 2 0 0 0-3 0L4 21'],
  // 压缩：四角向中心收拢（lucide shrink / ISC）。Continue.dev 的「Compact conversation」
  // 与 Zed 的 `/compact` 用的就是这个语汇；它的笔画间隙足够宽，16px 下不会糊成一团。
  compact: ['m15 15 6 6m-6-6v4.8m0-4.8h4.8', 'M9 19.8V15m0 0H4.2M9 15l-6 6', 'M15 4.2V9m0 0h4.8M15 9l6-6', 'M9 4.2V9m0 0H4.2M9 9 3 3'],
  // 目标：同心靶心，圆形按光学规则取 d20 / d12 / d4。
  target: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20', 'M12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12', 'M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4'],
  info: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20', 'M12 16v-5', 'M12 8h.01'],
  send: ['M22 2 11 13', 'M22 2l-7 20-4-9-9-4z'],
  // 安全停止沿用改动前的方块语汇（不再是绿色盾牌），强停沿用叉，两者对齐到同一光学尺寸。
  stop: ['M7.5 6h9a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 16.5v-9A1.5 1.5 0 0 1 7.5 6z'],
  force: ['m6 6 12 12M18 6 6 18'],
  steer: ['M5 19v-8a4 4 0 0 1 4-4h10', 'm15 3 4 4-4 4'],
  followUp: ['M4 7h16M4 12h9M4 17h6', 'M17 14v6m-3-3 3 3 3-3'],
  skill: ['M11.52 2.37a.5.5 0 0 1 .96 0L14.06 8.5A2 2 0 0 0 15.5 9.94l6.13 1.58a.5.5 0 0 1 0 .96L15.5 14.06a2 2 0 0 0-1.44 1.44l-1.58 6.13a.5.5 0 0 1-.96 0L9.94 15.5A2 2 0 0 0 8.5 14.06l-6.13-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5z'],
  file: ['M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z', 'M14 2v4a2 2 0 0 0 2 2h4', 'M8 13h8M8 17h5'],
  folder: ['M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z'],
});
const tones = Object.freeze({});

export function composerIcon(name) {
  if (!Object.hasOwn(artwork, name)) throw new Error(`Unknown composer icon: ${name}`);
  const body = artwork[name].map((d) => `<path d="${d}"/>`).join('');
  return `<svg class="action-icon composer-icon" data-icon="${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}

export function composerIconNode(name) {
  // Parsing is limited to the fixed allowlist above; no caller-provided markup.
  const template = document.createElement('template');
  template.innerHTML = composerIcon(name);
  return template.content.firstElementChild;
}


// Axiom action icons: one 24px grid, rounded 1.75px strokes, no font glyphs.
// Only trusted, fixed geometry is interpolated; callers never supply SVG markup.
export const actionIconPaths = Object.freeze({
  pin: 'M8 3h8M9 3v6c0 2-3 3-3 6h12c0-3-3-4-3-6V3M12 15v6',
  plus: 'M12 5v14M5 12h14',
  close: 'm6 6 12 12M18 6 6 18',
  menu: 'M4 6h16M4 12h16M4 18h16',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  chevron: 'm9 5 7 7-7 7',
  back: 'm15 5-7 7 7 7',
  up: 'M12 20V4m-6 6 6-6 6 6',
  down: 'M12 4v16m-6-6 6 6 6-6',
  external: 'M9 5H5v14h14v-4M13 5h6v6M19 5 9 15',
  collapse: 'M5 4h14M12 20V9m-5 5 5-5 5 5',
  check: 'm5 12 4.5 4.5L19 6.5',
  copy: 'M8 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v2M11 9h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z',
  duplicate: 'M8 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v2M11 9h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2ZM14.5 12v5M12 14.5h5',
  edit: 'm15 5 4 4M4 20l5-1L20 8a2.83 2.83 0 0 0-4-4L5 15l-1 5Z',
  trash: 'M4 6h16M9 6V4h6v2M6 6l1 14h10l1-14M10 10v6M14 10v6',
  folder: 'M3 8V6a2 2 0 0 1 2-2h4l3 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8h18',
  folderOpen: 'M3 10V6a2 2 0 0 1 2-2h4l3 3h7a2 2 0 0 1 2 2M3 10h18l-3 10H4L3 10Z',
  file: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Zm0 0v6h6M8 13h8M8 17h6',
  import: 'M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4',
  search: 'M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Zm-2 4.5 6 6',
  settings: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.08a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.08a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.08a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  code: 'm8 7-5 5 5 5m8-10 5 5-5 5M14 4l-4 16',
  sun: 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5',
  moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z',
  image: 'M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM4 16l5-5 5 5 3-3 3 3M16 8h.01',
  target: 'M21 12a9 9 0 1 1-9-9M17 12a5 5 0 1 1-5-5M12 12l8-8M16 4h4v4',
  skill: 'M12 3c1 5 4 8 9 9-5 1-8 4-9 9-1-5-4-8-9-9 5-1 8-4 9-9Z',
  stop: 'M7 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z',
  warning: 'M10.3 4a2 2 0 0 1 3.4 0l7 13a2 2 0 0 1-1.7 3H5a2 2 0 0 1-1.7-3l7-13ZM12 9v4m0 3v.01',
  retry: 'M20 10a8 8 0 1 0-2 8M20 4v6h-6',
  send: 'M12 20V4m-7 7 7-7 7 7',
  pause: 'M8 5v14M16 5v14',
  play: 'm8 5 11 7-11 7V5Z',
  sliders: 'M4 7h6m4 0h6M4 17h10m4 0h2M10 4v6M16 14v6',
  exit: 'M9 4H5v16h4M10 12h11m-5-5 5 5-5 5',
  star: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z',
  eye: 'M3 12s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6Zm12 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  eyeOff: 'm3 3 18 18M10 6h2c6 0 9 6 9 6l-2 3M6 7l-3 5s3 6 9 6h2M10 10a3 3 0 0 0 4 4',
  chat: 'M8 9h8M8 13h5M6 4h12a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H9l-6 3V7a3 3 0 0 1 3-3Z',
  horizontal: 'M3 12h18m-4-4 4 4-4 4M7 8l-4 4 4 4',
  vertical: 'M12 3v18m-4-4 4 4 4-4M8 7l4-4 4 4',
  space: 'M4 9v6h16V9',
  enter: 'M20 5v9H4m5-5-5 5 5 5',
});
// Static controls are hydrated once, including inert dialog templates.
export function initActionIcons(root) {
  const replace = (selector, name, glyph) => {
    for (const el of root.querySelectorAll(selector)) {
      const svg = el.querySelector('svg');
      const composerName = ({ 'add-context': 'context', 'add-image': 'image', 'goal-enter': 'target', 'compact-session': 'compact', stop: 'stop', 'force-stop': 'force' })[el.id] || el.dataset.context;
      const markup = composerName ? composerIcon(composerName) : actionIcon(name);
      if (svg && !glyph) { svg.outerHTML = markup; continue; }
      if (glyph) el.innerHTML = el.innerHTML.replace(glyph, markup);
      else el.innerHTML = markup;
    }
  };
  for (const [selector, name] of [
    ['#open-workspace, #reveal-workspace', 'folderOpen'], ['#import-session', 'import'],
    ['.search-wrap', 'search'], ['#open-settings', 'settings'], ['#copy-workspace', 'copy'],
    ['#open-raw-io', 'code'], ['#add-context', 'plus'], ['#add-image', 'image'],
    ['#goal-enter', 'target'], ['#compact-session', 'vertical'], ['[data-context="skill"]', 'skill'],
    ['[data-context="file"]', 'file'], ['[data-context="folder"]', 'folder'],
  ]) replace(selector, name);
  for (const [selector, name, glyph] of [
    ['#new', 'plus', '＋'], ['#toggle-sidebar', 'menu', '☰'],
    ['#earliest, [data-scroll="top"]', 'up', '↑'], ['#latest, [data-scroll="bottom"]', 'down', '↓'],
    ['#close-raw-io, #image-preview-close, button[aria-label^="关闭"]', 'close', '✕'],
    ['#context-close', 'close', '×'], ['#context-back', 'back', '‹'],
    ['.context-chevron', 'chevron', '›'], ['.task-open', 'external', '↗'],
    ['#stop', 'stop', '■'], ['#force-stop', 'warning', '⚠'],
  ]) replace(selector, name, glyph);
  for (const name of ['sun', 'moon']) {
    const el = root.querySelector(`.theme-icon-${name}`);
    if (el) el.outerHTML = actionIcon(name).replace('class="action-icon"', `class="action-icon theme-icon-${name}"`);
  }
  for (const template of root.querySelectorAll('template')) initActionIcons(template.content);
}
export function actionIconNode(name) {
  if (!Object.hasOwn(actionIconPaths, name)) throw new Error(`Unknown action icon: ${name}`);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({ class: 'action-icon', 'data-icon': name, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.75', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' })) svg.setAttribute(key, value);
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', actionIconPaths[name]);
  svg.append(path);
  return svg;
}
export function actionIcon(name) {
  if (!Object.hasOwn(actionIconPaths, name)) throw new Error(`Unknown action icon: ${name}`);
  return `<svg class="action-icon" data-icon="${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${actionIconPaths[name]}"/></svg>`;
}
