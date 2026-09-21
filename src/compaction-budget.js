import { estimateTokens } from '@earendil-works/pi-coding-agent';

export function requestBudget({ model, messages = [], systemPrompt = '', tools = [], config = {} }) {
  const window = model?.contextWindow ?? 0;
  const outputReserve = model?.maxTokens ?? 0;
  const errorReserve = Math.max(128, Math.ceil(window * 0.05));
  const hard = Math.max(0, window - outputReserve - errorReserve);
  const thresholds = [config.tokenThreshold, config.percentThreshold == null ? null : window * config.percentThreshold / 100].filter(n => Number.isFinite(n) && n > 0);
  const start = Math.min(hard * 0.8, ...(thresholds.length ? thresholds : [hard * 0.7]));
  const target = Math.min(start * 0.7, hard * 0.5);
  const fixed = Math.ceil(JSON.stringify({ systemPrompt, tools }).length / 3);
  const tokens = fixed + messages.reduce((sum, message) => sum + estimateTokens(message), 0);
  return { window, outputReserve, errorReserve, hard, start, target, fixed, tokens, safe: window > 0 && tokens <= hard };
}

export function compactionError(code, message = code, cause) {
  const action = ['COMMIT_UNCERTAIN', 'SOURCE_CORRUPT', 'ARCHIVE_IDENTITY_CONFLICT', 'SCOPE_DENIED', 'CONSTRAINT_LOST'].includes(code) ? 'stop'
    : ['STALE_CANDIDATE', 'NO_VALID_CUT', 'WINDOW_UNSAFE', 'SUMMARY_INVALID', 'SUMMARY_SCHEMA_INVALID', 'SUMMARY_SOURCE_INVALID', 'SUMMARY_QUOTE_MISMATCH', 'SUMMARY_TRANSITION_INVALID', 'SUMMARY_AUTHORITY_REQUIRED'].includes(code) ? 'replan' : 'retry';
  return Object.assign(new Error(message, cause ? { cause } : undefined), { code, action });
}
