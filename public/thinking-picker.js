import { THINKING_LEVELS, THINKING_HELP, thinkingLevels, resolveThinking, thinkingFavoriteKey } from "./thinking.js";
import { createChoiceColumn } from "./choice-column.js";

// One view-model for every thinking selector. null/empty is inheritance, never off.
export function thinkingSelection({ levels, value, inherit, policy = "nearest", manual = false, deferred = false } = {}) {
  // Deferred defaults express valid preferences, not a claim about model support.
  const supported = manual || deferred ? [...THINKING_LEVELS] : thinkingLevels(levels);
  const inherited = inherit != null && (value == null || value === "");
  const requested = value ?? "";
  const effective = inherited ? "" : supported.length
    ? resolveThinking(THINKING_LEVELS.includes(value) ? value : supported[0], supported, { policy }) : "";
  const adapted = !inherited && requested !== "" && requested !== effective;
  const entries = [...(inherit != null ? [["", inherit]] : []), ...supported.map(level => [level, level])];
  const description = manual ? "离线手动选择：尚未验证修复模型支持此等级。"
    : deferred ? "继承模型尚未确定：仅保存思考偏好，创建时按实际模型适配；这里不表示模型支持全部等级。"
    : !supported.length ? "模型思考能力不可用，请检查模型配置。"
    : adapted ? `偏好 ${requested} 在此模型不可用，实际使用 ${effective}。` : THINKING_HELP;
  return { entries, requested, effective, adapted, description, unavailable: !supported.length && !inherited };
}

// Renderers share the same view-model: enhanced native select for forms, searchable
// column for the compact composer. Neither knows providers or generates API payloads.
export function createThinkingPicker({ picker } = {}) {
  const records = new Map();
  function sync(select, state) {
    let record = records.get(select);
    if (!record) {
      const change = () => { select.dataset.thinkingRequested = select.value; render(select, record); };
      record = { state: {}, change };
      records.set(select, record);
      select.dataset.modelKind = "thinking";
      select.addEventListener("change", change);
      picker?.enhance(select, "thinking");
    }
    record.state = { ...record.state, ...state };
    if (state && Object.hasOwn(state, "value")) {
      select.dataset.thinkingRequested = state.value ?? "";
      record.effective = undefined;
    }
    return render(select, record);
  }
  function render(select, record) {
    if (record.effective !== undefined && select.value !== record.effective) select.dataset.thinkingRequested = select.value;
    const supplied = typeof record.state.context === "function" ? record.state.context() : {};
    const view = thinkingSelection({ ...record.state, ...supplied, value: select.dataset.thinkingRequested });
    const entries = view.entries.length ? view.entries : [["", "无可用思考等级"]];
    if (select.options.length !== entries.length || entries.some(([value, text], i) => select.options[i].value !== value || select.options[i].text !== text)) {
      select.replaceChildren(...entries.map(([value, text]) => new select.ownerDocument.defaultView.Option(text, value)));
    }
    select.value = view.effective;
    record.effective = view.effective;
    select.title = view.description;
    select.dataset.thinkingUnavailable = String(view.unavailable);
    select.setCustomValidity(view.unavailable ? view.description : "");
    // An empty capability set must not manufacture a selectable off option.
    for (const option of select.options) option.disabled = view.unavailable;
    select.dataset.thinkingModel = supplied.model ?? record.state.model ?? "";
    picker?.sync(select);
    return view;
  }
  return {
    sync,
    refreshAll() { for (const [select, record] of records) { if (select.isConnected) render(select, record); else this.dispose(select); } },
    requested: select => (select.value !== records.get(select)?.effective ? select.value : select.dataset.thinkingRequested) || null,
    dispose(select) {
      const record = records.get(select);
      if (!record) return;
      select.removeEventListener("change", record.change);
      records.delete(select);
      picker?.dispose(select);
    },
    column({ levels, value, model, ...options }) {
      const view = thinkingSelection({ levels, value });
      const node = createChoiceColumn({ ...options, title: "思考等级", entries: view.entries, selected: view.effective,
        favoriteKey: level => thinkingFavoriteKey(model, level) });
      node.title = view.description;
      return node;
    },
  };
}
