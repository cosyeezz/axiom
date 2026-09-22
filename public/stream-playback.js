// 平滑流式显示游标：纯状态机，无 DOM、无定时器、无网络。
// 调用方每帧传入当前“权威正文”（已归并的完整文本，不是 delta）。本模块只保留该字符串引用、
// 已显示的字素数、以及整段字素起始表，不复制正文、不缓存历史、不参与归并。
//
// offset 是 UTF-16 下标（text.slice(0, offset)）；pending 是未显示字素数。
//
// 字素稳定性：正文不超过 MAX_TEXT（24000，与 markdown.js.isPlainText 同阈值）时，每次输入变化都
// 对**整段正文**重跑 Intl.Segmenter，再按“已显示字素数”在新分段上重新定位 offset。RI 奇偶、
// ZWJ 链、标记序列、跨批代理对、尾部被扩展，全部由 Segmenter 定夺，不写固定尾窗/码点回退启发式；
// 超长或没有 Segmenter 时整批对齐（绝不截断字符）。因“已显示字素数”在新分段上只会落到更靠后的
// 合法边界，offset 不会回退、也不会显示半个字素。
//
// 数值参数（先用假时钟调，再实机调参）：
//   BUFFER_MS     起播/追平后来新字时的缓冲，避免逐字抖动
//   BASE_RATE     基准速度（字素/秒）
//   CATCHUP_S     允许的目标滞后（秒）：稳态滞后 ≈ 到达速率 × CATCHUP_S，超出部分按此时间追赶
//   MAX_RATE      速度上限（字素/秒）
//   HOLD_TAIL_MS  新到的尾字素静默这么久后才展示，等它稳定
//   MAX_STEP_G    单帧显示上限（真时间照常累计，下一帧继续，不一次补几万步）
//   MAX_TAIL_G    未显示尾部上限（字素），超过直接整批对齐，不为动画无限落后（上限/MAX_RATE ≈ 1s 尾）
//   MAX_TEXT      整段分段的正文长度上限（与 markdown.js 一致）
const BUFFER_MS = 150;
const BASE_RATE = 10;
const CATCHUP_S = 1;
const MAX_RATE = 200;
const HOLD_TAIL_MS = 300;
const MAX_STEP_G = 120;
const MAX_TAIL_G = 200;
const MAX_TEXT = 24000;

// ponytail: Segmenter 在实例创建时取，便于测试临时移除 Intl.Segmenter 验证整批降级。
const makeSegmenter = () =>
  typeof Intl?.Segmenter === "function" ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;

export function createPlayback() {
  const segmenter = makeSegmenter();
  let text = "";           // 权威正文引用（只保留最新一次，不积累副本）
  let revision = 0;
  let starts = [];         // 整段正文的字素起始（升序，均为合法字素边界）
  let safe = 0;            // 可显示字数上限（≤ starts.length；末尾孤立高代理项不算）
  let shown = 0;           // 已显示字素数；<0 表示无法分段（超长/无 Segmenter），已整批对齐
  let lastGrowAt = -Infinity;
  let bufferUntil = -Infinity;
  let lastNow = null;
  let rate = BASE_RATE;
  let arrival = BASE_RATE; // 近期到达速度估计（字素/秒）
  let carry = 0;

  const offsetOf = () => (shown < 0 || shown >= starts.length ? text.length : starts[shown]);
  const pendingCount = () => (shown < 0 ? 0 : starts.length - shown);

  const isHigh = (code) => code >= 0xd800 && code <= 0xdbff;

  // 末尾孤立高代理项是不完整代理对：Intl 把它当独立字素，但显示出来就是半个字符。
  // 活跃播放按住它（返回“可显示字数”上限），等低代理项补齐后再展示；只有 terminal 才显示真实原文。
  function cap(all) {
    let cut = text.length;
    while (cut > 0 && isHigh(text.charCodeAt(cut - 1))) cut--;
    if (cut === text.length) return all.length;
    let n = 0;
    while (n + 1 < all.length && all[n + 1] <= cut) n++;  // 整个字素都在 cut 之前
    return n;
  }

  // 整段分段；无 Segmenter 或超长返回 null（调用方走整批对齐）。
  function segmentAll() {
    if (!segmenter || text.length > MAX_TEXT) return null;
    const out = [];
    for (const { index } of segmenter.segment(text)) out.push(index);
    return out;
  }

  // 整批对齐：不播放，立即显示全部（terminal/align/replace/revision/超长/无 Segmenter）。
  // raw=true（terminal）显示真实原文，不做不完整代理对 hold。
  function snap(all = segmentAll(), raw = false) {
    starts = all ?? [];
    safe = all ? (raw ? all.length : cap(all)) : 0;
    shown = all ? safe : -1;
    carry = 0;
  }

  // 正文前缀延长后重排：保留已显示字素数，在新分段上重新定位；积压过大则降级整批。
  // 返回本批新增字素数；降级整批时返回 null。
  function relayout(prevTotal) {
    const all = segmentAll();
    if (!all || shown < 0) {
      snap(all);
      return null;
    }
    const capped = cap(all);
    const from = Math.min(shown, all.length, capped);
    if (all.length - from > MAX_TAIL_G) {
      snap(all);
      return null;
    }
    starts = all;
    safe = capped;
    shown = from;
    return all.length - prevTotal;
  }

  return {
    update(next, now, { align = false, terminal = false, revision: rev = 0 } = {}) {
      const nextText = String(next ?? "");
      const time = Number.isFinite(now) ? now : 0;
      const changed = nextText !== text;
      // 同 revision 且是新正文前缀延长 => append；其余变化（缩短/中段改动）视为替换。
      const grew = changed && rev === revision && nextText.length > text.length &&
        (text.length <= MAX_TEXT ? nextText.startsWith(text) : true);

      if (rev !== revision || align || terminal) {
        revision = rev;
        text = nextText;
        snap(undefined, terminal);
      } else if (grew) {
        const drained = pendingCount() === 0;
        const prevTotal = starts.length;
        text = nextText;
        const added = relayout(prevTotal);
        // 目标速度参考到达节奏：新增字素数 / 距上次到货的真实时间（EWMA 平滑）。
        const gap = time - lastGrowAt;
        if (added > 0 && Number.isFinite(gap) && gap > 0) {
          arrival += (Math.min(MAX_RATE, (added * 1000) / gap) - arrival) * 0.5;
        }
        lastGrowAt = time;
        if (drained) {
          // 缓冲已清空又来了新字：重新起一段短缓冲，别单字跳。
          bufferUntil = time + BUFFER_MS;
          carry = 0;
        }
      } else if (changed) {
        text = nextText;
        snap();
      }

      if (lastNow === null) {
        lastNow = time;
        return { offset: offsetOf(), pending: pendingCount() };
      }
      const dt = Math.max(0, time - lastNow);
      lastNow = time;

      // 新到的尾字素静默不足 HOLD_TAIL_MS 时先按住：等它稳定，避免刚显示就被后续字符扩展。
      // room 已剔除末尾不完整代理对（safe），所以孤立高代理项永远不会进入可见前缀。
      const revealable = safe - shown - (time - lastGrowAt < HOLD_TAIL_MS ? 1 : 0);
      if (time >= bufferUntil && revealable > 0) {
        // 目标速度 = 到达速度 + 超出目标滞后的积压 / CATCHUP_S：正常节奏下按到达速度连续展开，
        // 突发积压才加速追赶；下限 BASE_RATE，上限 MAX_RATE。
        const pending = pendingCount();
        const excess = Math.max(0, pending - arrival * CATCHUP_S);
        const target = Math.min(MAX_RATE, Math.max(BASE_RATE, arrival + excess / CATCHUP_S));
        rate += (target - rate) * Math.min(1, dt / 250);
        // 真时间照常累计（不 clamp dt，否则低帧率永远落后），carry 以未显示字素封顶，
        // 单帧只做 MAX_STEP_G 步，剩下的下一帧继续追。
        carry = Math.min(carry + (dt / 1000) * rate, revealable);
        const k = Math.min(Math.floor(carry), revealable, MAX_STEP_G);
        if (k > 0) {
          carry -= k;
          shown += k;
        }
      }
      return { offset: offsetOf(), pending: pendingCount() };
    },
  };
}
