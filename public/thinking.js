// Shared by browser, server and the SDK-independent repair CLI. Provider capabilities
// come from Pi's getSupportedThinkingLevels; this module never guesses from model IDs.
export const THINKING_LEVELS = Object.freeze(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);
export const THINKING_HELP = "统一思考偏好；实际参数由模型供应商映射。off 不保证关闭模型内部推理。";

export function thinkingLevels(levels) {
  // Missing capability data is unknown, not evidence that a model supports all levels.
  if (!Array.isArray(levels)) return [];
  return THINKING_LEVELS.filter(level => levels.includes(level));
}

export function resolveThinking(value, levels, { policy = "nearest" } = {}) {
  if (!["strict", "lowest", "nearest"].includes(policy)) throw new Error("未知的思考等级适配策略");
  if (!THINKING_LEVELS.includes(value)) throw new Error("无效的思考等级");
  const supported = thinkingLevels(levels);
  if (!supported.length) throw new Error("模型没有可用的思考等级，请检查模型配置");
  if (supported.includes(value)) return value;
  if (policy === "strict") throw new Error("Unsupported thinking level");
  if (policy === "lowest") return supported[0];
  // Pi clamp semantics: prefer the next supported higher level, otherwise lower.
  const index = THINKING_LEVELS.indexOf(value);
  return supported.find(level => THINKING_LEVELS.indexOf(level) > index) ?? supported.at(-1);
}

export function thinkingFavoriteKey(model, level) {
  return model && THINKING_LEVELS.includes(level) ? `${model}:${level}` : null;
}
