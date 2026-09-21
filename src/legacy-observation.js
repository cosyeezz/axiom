// Legacy observation archive: read-only compatibility. No folding or archive writers.
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open, readFile } from "node:fs/promises";
import { join } from "node:path";
export const THRESHOLD_BYTES = 6 * 1024;
/** 前几次请求仍全文发送，之后占位符接管。 */
export const FULL_SENDS = 2;
/** 占位符摘录预算：头尾各半，只取完整行。 */
export const PLACEHOLDER_EXCERPT_BYTES = 1024;

const OBSERVATION_ID_PATTERN = /^obs_[a-f0-9]{24}$/u;

const READ_OBJECT_FLAGS = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);

const RECALL_MAX_BYTES = 16 * 1024;
const RECALL_MAX_LINES = 400;
const RECALL_HEADER_RESERVE_BYTES = 512;
const RECALL_HEADER_LINES = 2;
const RECALL_LIMITS = {
  maxBytes: RECALL_MAX_BYTES - RECALL_HEADER_RESERVE_BYTES,
  maxLines: RECALL_MAX_LINES - RECALL_HEADER_LINES,
};
/** 默认单次取回正文预算：小于硬上限，避免“只想确认一行”也拉回满页。 */
const RECALL_DEFAULT_BYTES = 4 * 1024;
/** 行定位 / 关键词检索需要整文件入内存，超过这个尺寸退回字节分页。 */
const RECALL_SCAN_MAX_BYTES = 8 * 1024 * 1024;
const RECALL_DEFAULT_CONTEXT_LINES = 2;
const RECALL_MAX_CONTEXT_LINES = 20;
const RECALL_MAX_QUERY_BYTES = 512;

export function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function countLines(text) {
  if (text.length === 0) return 0;
  let lines = text.endsWith("\n") ? 0 : 1;
  for (const character of text) {
    if (character === "\n") lines += 1;
  }
  return lines;
}

function countBufferLines(buffer) {
  if (buffer.length === 0) return 0;
  let lines = buffer[buffer.length - 1] === 0x0a ? 0 : 1;
  for (const byte of buffer) {
    if (byte === 0x0a) lines += 1;
  }
  return lines;
}

export const OBSERVATION_DEFAULTS = {
  thresholdBytes: THRESHOLD_BYTES,
  fullSends: FULL_SENDS,
  minContextTokens: 0,
  reportFullSends: FULL_SENDS,
  placeholderExcerptBytes: PLACEHOLDER_EXCERPT_BYTES,
  foldEnabled: true,
  foldRecallEchoes: true,
  strictVerify: false,
  recallDefaultBytes: RECALL_DEFAULT_BYTES,
};

function positiveInteger(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value == null) return fallback;
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`observation-pack config expects an integer in [${min}, ${max}], received ${value}`);
  }
  return value;
}

export function resolveObservationConfig(options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new Error("observation-pack config must be an object");
  const allowed = new Set([...Object.keys(OBSERVATION_DEFAULTS), "agentId"]);
  for (const key of Object.keys(options)) {
    if (!allowed.has(key)) throw new Error(`Unknown observation-pack config: ${key}`);
    if (["foldEnabled", "foldRecallEchoes", "strictVerify"].includes(key) && typeof options[key] !== "boolean") {
      throw new Error(`observation-pack ${key} must be a boolean`);
    }
    if (key !== "agentId" && options[key] == null) throw new Error(`observation-pack ${key} must not be null`);
  }
  const resolved = {
    thresholdBytes: positiveInteger(options.thresholdBytes, THRESHOLD_BYTES, { min: 256 }),
    fullSends: positiveInteger(options.fullSends, FULL_SENDS, { min: 0, max: 64 }),
    minContextTokens: positiveInteger(options.minContextTokens, 0, { min: 0 }),
    reportFullSends: positiveInteger(options.reportFullSends, options.fullSends ?? FULL_SENDS, { min: 0, max: 64 }),
    placeholderExcerptBytes: positiveInteger(options.placeholderExcerptBytes, PLACEHOLDER_EXCERPT_BYTES, { min: 64, max: RECALL_LIMITS.maxBytes }),
    foldEnabled: options.foldEnabled ?? true,
    foldRecallEchoes: options.foldRecallEchoes ?? true,
    strictVerify: options.strictVerify ?? false,
    recallDefaultBytes: positiveInteger(options.recallDefaultBytes, RECALL_DEFAULT_BYTES, { min: 256, max: RECALL_LIMITS.maxBytes }),
  };
  const fingerprint = hash(JSON.stringify(Object.entries(resolved).sort(([a], [b]) => (a < b ? -1 : 1)))).slice(0, 12);
  return Object.freeze({ ...resolved, configVersion: fingerprint });
}

const DEFAULT_CONFIG = resolveObservationConfig();

export function objectPath(root, id) {
  return join(root, "objects", `${id}.txt`);
}

/** sidecar manifest：持久化完整 contentHash 与字节数，取回时据此校验等长篡改。 */
export function manifestPath(root, id) {
  return join(root, "objects", `${id}.json`);
}

export function isObservationId(id) {
  return OBSERVATION_ID_PATTERN.test(id);
}

export async function readManifest(root, id) {
  try {
    const raw = await readFile(manifestPath(root, id), "utf8");
    const parsed = JSON.parse(raw);
    if (parsed?.id !== id || !/^[a-f0-9]{64}$/.test(parsed?.contentHash ?? "") || !Number.isSafeInteger(parsed?.bytes) || parsed.bytes < 0) throw new Error(`Invalid observation manifest: ${id}`);
    return parsed;
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
}

export function createIntegrityVerifier() {
  const verified = new Map();
  return async function verifyObject(root, id, { strict = false } = {}) {
    const path = objectPath(root, id);
    const handle = await open(path, READ_OBJECT_FLAGS);
    let stats;
    try {
      stats = await handle.stat();
      if (!stats.isFile()) throw new Error("Stored observation is not a regular file");
    } finally {
      await handle.close();
    }

    const manifest = await readManifest(root, id);
    const cacheKey = `${path}\0${stats.size}\0${stats.mtimeMs}\0${stats.ctimeMs}\0${strict}\0${JSON.stringify(manifest)}`;
    if (verified.size >= 256) verified.clear();
    const cached = verified.get(cacheKey);
    if (cached) {
      if (cached.error) throw new Error(cached.error);
      return cached.state;
    }

    if (!manifest) {
      // 旧归档没有 manifest：严格模式拒绝取回，宽松模式记为 unverified 继续。
      if (strict) {
        const message = `Observation ${id} has no manifest; refusing to recall under strictVerify`;
        verified.set(cacheKey, { error: message });
        throw new Error(message);
      }
      return "unverified";
    }
    if (manifest.bytes !== stats.size) {
      const message = `Observation ${id} size does not match its manifest (${stats.size} vs ${manifest.bytes})`;
      verified.set(cacheKey, { error: message });
      throw new Error(message);
    }
    const actual = hash(await readFile(path));
    if (actual !== manifest.contentHash) {
      const message = `Observation ${id} content hash does not match its manifest`;
      verified.set(cacheKey, { error: message });
      throw new Error(message);
    }
    verified.set(cacheKey, { state: "verified" });
    return "verified";
  };
}

function trimUtf8End(buffer, limit) {
  let end = limit;
  while (end > 0 && end < buffer.length && ((buffer[end] ?? 0) & 0xc0) === 0x80) end -= 1;
  return end;
}

/** 起点落在多字节字符中间时前移到下一个字符首字节，避免开头出现替换字符。 */
function alignUtf8Start(buffer, start) {
  let aligned = start;
  while (aligned < buffer.length && ((buffer[aligned] ?? 0) & 0xc0) === 0x80) aligned += 1;
  return aligned;
}

function excerptByBytes(text, budgetBytes, fromEnd) {
  const buffer = Buffer.from(text, "utf8");
  if (buffer.length <= budgetBytes) return text;
  if (fromEnd) {
    const start = alignUtf8Start(buffer, buffer.length - budgetBytes);
    return buffer.subarray(start).toString("utf8");
  }
  return buffer.subarray(0, trimUtf8End(buffer, budgetBytes)).toString("utf8");
}

export async function readRecallChunk(path, offset, limits) {
  const handle = await open(path, READ_OBJECT_FLAGS);
  try {
    const fileStats = await handle.stat();
    if (!fileStats.isFile()) throw new Error("Stored observation is not a regular file");
    if (offset > fileStats.size) throw new Error(`Offset ${offset} exceeds observation size ${fileStats.size}`);

    const available = Math.max(0, fileStats.size - offset);
    const buffer = Buffer.alloc(Math.min(available, limits.maxBytes + 4));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset);

    // 起点可能落在多字节字符中间（模型按上次 next_offset 之外的值试探时）：
    // 前移到字符边界并如实回报实际起点，chunk 里不留替换字符。
    const start = alignUtf8Start(buffer.subarray(0, bytesRead), 0);
    let end = Math.min(bytesRead, start + limits.maxBytes);
    let newlineCount = 0;

    for (let index = start; index < end; index += 1) {
      if (buffer[index] !== 0x0a) continue;
      newlineCount += 1;
      if (newlineCount === limits.maxLines) {
        end = index + 1;
        break;
      }
    }

    end = trimUtf8End(buffer, end);
    const chunk = buffer.subarray(start, Math.max(start, end));
    const nextOffset = offset + start + chunk.length;
    return {
      mode: "bytes",
      text: chunk.toString("utf8"),
      bytes: chunk.length,
      lines: countBufferLines(chunk),
      offset: offset + start,
      nextOffset,
      eof: nextOffset >= fileStats.size,
      size: fileStats.size,
    };
  } finally {
    await handle.close();
  }
}

async function readWholeObject(path) {
  const handle = await open(path, READ_OBJECT_FLAGS);
  try {
    const fileStats = await handle.stat();
    if (!fileStats.isFile()) throw new Error("Stored observation is not a regular file");
    if (fileStats.size > RECALL_SCAN_MAX_BYTES) {
      throw new Error(`Observation is ${fileStats.size} bytes; line and query modes cap at ${RECALL_SCAN_MAX_BYTES}. Use offset paging instead.`);
    }
    return { text: await handle.readFile("utf8"), size: fileStats.size };
  } finally {
    await handle.close();
  }
}

function splitLines(text) {
  const lines = text.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** 行范围读取：1 基起始行 + 行数，按字节预算截断。 */
export async function readRecallLines(path, startLine, lineLimit, limits) {
  const { text, size } = await readWholeObject(path);
  const lines = splitLines(text);
  if (startLine > lines.length) {
    throw new Error(`startLine ${startLine} exceeds observation line count ${lines.length}`);
  }
  const begin = startLine - 1;
  const selected = [];
  let bytes = 0;
  let index = begin;
  while (index < lines.length && selected.length < lineLimit && selected.length < limits.maxLines) {
    const candidate = `${lines[index]}\n`;
    const candidateBytes = Buffer.byteLength(candidate, "utf8");
    if (bytes + candidateBytes > limits.maxBytes && selected.length > 0) break;
    if (bytes + candidateBytes > limits.maxBytes) {
      selected.push(`${excerptByBytes(lines[index], limits.maxBytes, false)}\n`);
      bytes = limits.maxBytes;
      index += 1;
      break;
    }
    selected.push(candidate);
    bytes += candidateBytes;
    index += 1;
  }
  return {
    mode: "lines",
    text: selected.join(""),
    bytes,
    lines: selected.length,
    startLine,
    nextLine: index + 1,
    totalLines: lines.length,
    eof: index >= lines.length,
    size,
  };
}

/** 关键词检索：大小写不敏感子串，命中行带上下文，按字节预算截断。 */
export async function searchRecall(path, query, contextLines, limits) {
  const { text, size } = await readWholeObject(path);
  const lines = splitLines(text);
  const needle = query.toLowerCase();
  const blocks = [];
  let bytes = 0;
  let matches = 0;
  let emittedThrough = 0; // 已输出到的行号（1 基），用于合并相邻命中窗口
  let truncated = false;

  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].toLowerCase().includes(needle)) continue;
    matches += 1;
    const from = Math.max(emittedThrough + 1, index + 1 - contextLines);
    const to = Math.min(lines.length, index + 1 + contextLines);
    if (to < from) continue;
    const rendered = [];
    for (let line = from; line <= to; line += 1) rendered.push(`${line}: ${lines[line - 1]}\n`);
    const block = (from > emittedThrough + 1 && emittedThrough > 0 ? "...\n" : "") + rendered.join("");
    const blockBytes = Buffer.byteLength(block, "utf8");
    const blockLines = countLines(block);
    if (bytes + blockBytes > limits.maxBytes || countLines(blocks.join("")) + blockLines > limits.maxLines) {
      truncated = true;
      break;
    }
    blocks.push(block);
    bytes += blockBytes;
    emittedThrough = to;
  }

  return {
    mode: "query",
    text: blocks.join(""),
    bytes,
    lines: countLines(blocks.join("")),
    matches,
    totalLines: lines.length,
    truncated,
    lastLine: emittedThrough,
    eof: !truncated,
    size,
  };
}

export function createObservationStats() {
  return {
    foldedIds: new Set(),
    recalledIds: new Set(),
    savedTokens: 0,
    recalls: 0,
    recallPages: 0,
    recallFailures: 0,
    echoFolds: 0,
    failures: 0,
  };
}

export function observationRuntime(stats) {
  if (!stats) return undefined;
  const folded = stats.foldedIds.size;
  const recalledObjects = stats.recalledIds.size;
  return {
    folded,
    savedTokens: stats.savedTokens,
    // recalls 保留“成功取回调用次数”语义（面板展示用），recallPages 与之同义但命名更准确。
    recalls: stats.recalls,
    recallPages: stats.recallPages,
    recalledObjects,
    recallFailures: stats.recallFailures,
    echoFolds: stats.echoFolds,
    failures: stats.failures,
    // 有多少折叠对象事后被重新取回：>1 不可能，可直接用于判断折叠是否折错了东西。
    recallRate: folded ? Math.min(1, recalledObjects / folded) : 0,
  };
}
function renderRecallHeader(id, chunk, integrity) {
  const verified = integrity === "verified" ? " integrity=verified" : integrity === "unverified" ? " integrity=unverified" : "";
  if (chunk.mode === "query") {
    return [
      `[obs_recall id=${id} mode=query matches=${chunk.matches} total_lines=${chunk.totalLines} truncated=${chunk.truncated}${verified}]`,
      `[chunk_bytes=${chunk.bytes} chunk_lines=${chunk.lines}; line numbers are 1-based; use startLine to read around a match]`,
    ].join("\n");
  }
  if (chunk.mode === "lines") {
    return [
      `[obs_recall id=${id} mode=lines start_line=${chunk.startLine} next_line=${chunk.nextLine} total_lines=${chunk.totalLines} eof=${chunk.eof}${verified}]`,
      `[chunk_bytes=${chunk.bytes} chunk_lines=${chunk.lines}; use next_line to continue]`,
    ].join("\n");
  }
  return [
    `[obs_recall id=${id} offset=${chunk.offset} next_offset=${chunk.nextOffset} eof=${chunk.eof}${verified}]`,
    `[chunk_bytes=${chunk.bytes} chunk_lines=${chunk.lines}; use next_offset to continue]`,
  ].join("\n");
}

export function legacyObservationExtension(root, stats = null) {
 if (!root) throw new Error("legacy observation requires an archive directory");
 const config = resolveObservationConfig({});
 return (pi) => {
 const ledger = async () => {};
 const verifyObject = createIntegrityVerifier();
    pi.registerTool({
      name: "obs_recall",
      label: "Recall Observation",
      description:
        "Read a stored large tool result. Default reads a small page from `offset`; " +
        "prefer `query` (keyword) or `startLine`/`lineLimit` to pull only what you need.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Observation id from a placeholder" },
          offset: { type: "integer", minimum: 0, description: "Byte offset, default 0" },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: RECALL_LIMITS.maxBytes,
            description: `Max body bytes to return, default ${config.recallDefaultBytes}`,
          },
          startLine: { type: "integer", minimum: 1, description: "1-based start line; overrides offset" },
          lineLimit: { type: "integer", minimum: 1, maximum: RECALL_LIMITS.maxLines, description: "Lines to return with startLine" },
          query: { type: "string", description: "Case-insensitive substring; returns matching lines with context" },
          contextLines: {
            type: "integer",
            minimum: 0,
            maximum: RECALL_MAX_CONTEXT_LINES,
            description: `Context lines around each query match, default ${RECALL_DEFAULT_CONTEXT_LINES}`,
          },
        },
        required: ["id"],
        additionalProperties: false,
      },
      async execute(_toolCallId, params) {
        const input = params ?? {};
        if (!isObservationId(input.id)) throw new Error(`Unknown observation id: ${input.id}`);
        for (const field of ["offset", "limit", "startLine", "lineLimit", "contextLines"]) {
          const value = input[field];
          if (value != null && (!Number.isSafeInteger(value) || value < 0)) {
            throw new Error(`obs_recall ${field} must be a non-negative integer`);
          }
        }
        if (input.query != null && (typeof input.query !== "string" || input.query.length === 0)) {
          throw new Error("obs_recall query must be a non-empty string");
        }
        if (input.query != null && Buffer.byteLength(input.query, "utf8") > RECALL_MAX_QUERY_BYTES) {
          throw new Error(`obs_recall query must be at most ${RECALL_MAX_QUERY_BYTES} bytes`);
        }
        if (input.startLine != null && input.startLine < 1) throw new Error("obs_recall startLine is 1-based");

        if (input.query != null && (input.offset != null || input.startLine != null)) throw new Error("obs_recall query cannot be combined with offset or startLine");
        if (input.startLine != null && input.offset != null) throw new Error("obs_recall startLine cannot be combined with offset");
        if (input.contextLines != null && input.query == null) throw new Error("obs_recall contextLines requires query");
        if (input.limit === 0 || input.lineLimit === 0) throw new Error("obs_recall limits must be positive");
        const limits = {
          maxBytes: Math.min(input.limit ?? config.recallDefaultBytes, RECALL_LIMITS.maxBytes),
          maxLines: Math.min(input.lineLimit ?? RECALL_LIMITS.maxLines, RECALL_LIMITS.maxLines),
        };
        const offset = input.offset ?? 0;

        let chunk;
        let integrity = "unverified";
        try {
          // 取回前按 manifest 校验：等长改写 size 检查看不出来，只有全文哈希能发现。
          integrity = await verifyObject(root, input.id, { strict: config.strictVerify });
          const path = objectPath(root, input.id);
          if (input.query != null) {
            chunk = await searchRecall(path, input.query, input.contextLines ?? RECALL_DEFAULT_CONTEXT_LINES, limits);
          } else if (input.startLine != null) {
            chunk = await readRecallLines(path, input.startLine, input.lineLimit ?? RECALL_LIMITS.maxLines, limits);
          } else {
            chunk = await readRecallChunk(path, offset, limits);
          }
        } catch (error) {
          const missing = error instanceof Error && "code" in error && error.code === "ENOENT";
          const reason = missing ? `Unknown observation id: ${input.id}` : error instanceof Error ? error.message : String(error);
          if (stats) stats.recallFailures += 1;
          // 取回失败同样记账：只记成功会让“折叠后取不回来”在审计里完全隐形。
          await ledger({ event: "recall-failed", id: input.id, mode: input.query != null ? "query" : input.startLine != null ? "lines" : "bytes", reason });
          throw missing ? new Error(reason) : error;
        }

        const header = renderRecallHeader(input.id, chunk, integrity);
        const content = `${header}\n${chunk.text}`;
        if (Buffer.byteLength(content, "utf8") > RECALL_MAX_BYTES || countLines(content) > RECALL_MAX_LINES) {
          throw new Error("Recall output exceeded its hard limit");
        }
        if (stats) {
          stats.recalls += 1;
          stats.recallPages += 1;
          stats.recalledIds.add(input.id);
        }
        await ledger({
          event: "recall",
          id: input.id,
          mode: chunk.mode,
          integrity,
          offset: chunk.mode === "bytes" ? chunk.offset : undefined,
          startLine: chunk.startLine,
          query: input.query != null ? `len:${input.query.length}` : undefined,
          matches: chunk.matches,
          bytes: chunk.bytes,
          lines: chunk.lines,
          nextOffset: chunk.nextOffset,
          nextLine: chunk.nextLine,
          eof: chunk.eof,
        });
        return {
          content: [{ type: "text", text: content }],
          details: {
            sliceId: hash(`${input.id}\0${chunk.mode}\0${chunk.offset ?? offset}\0${chunk.nextOffset ?? ""}\0${chunk.nextLine ?? ""}\0${hash(chunk.text)}`),
            id: input.id,
            mode: chunk.mode,
            integrity,
            offset: chunk.offset ?? offset,
            bytes: chunk.bytes,
            lines: chunk.lines,
            nextOffset: chunk.nextOffset,
            nextLine: chunk.nextLine,
            matches: chunk.matches,
            eof: chunk.eof,
          },
        };
      },
    });

 };
}
