// Observation Pack：大工具结果先全文发送 FULL_SENDS 次，之后在 context 投影层
// 替换为字节级稳定的占位符；原文按内容寻址归档，模型用 obs_recall 分页取回。
// 移植自 SoL-Pi extensions/observation-pack（NVIDIA，MIT），适配点见 devlog 2026-09-19。
// 关键不变量：不改写持久历史（投影层 structuredClone 之后的消息数组）、
// 折叠失败 fail-open（原文照发）、占位符为纯函数输出（前缀缓存逐字节稳定）。
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { appendFile, lstat, mkdir, open } from "node:fs/promises";
import { dirname, join } from "node:path";

/** Only tool results larger than this participate. AXIOM 定 6KB（SoL-Pi 原版 10KB）。 */
export const THRESHOLD_BYTES = 6 * 1024;
/** 前几次请求仍全文发送，之后占位符接管。 */
export const FULL_SENDS = 2;
/** 占位符摘录预算：头尾各半，只取完整行。 */
export const PLACEHOLDER_EXCERPT_BYTES = 1024;

const CHARS_PER_TOKEN = 4;
const OBSERVATION_ID_PATTERN = /^obs_[a-f0-9]{24}$/u;
// Windows 无 O_NOFOLLOW（undefined 按位或会得到 NaN）。
const READ_OBJECT_FLAGS = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);
const CREATE_OBJECT_FLAGS = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0);

const RECALL_MAX_BYTES = 16 * 1024;
const RECALL_MAX_LINES = 400;
const RECALL_HEADER_RESERVE_BYTES = 512;
const RECALL_HEADER_LINES = 2;
const RECALL_LIMITS = {
  maxBytes: RECALL_MAX_BYTES - RECALL_HEADER_RESERVE_BYTES,
  maxLines: RECALL_MAX_LINES - RECALL_HEADER_LINES,
};

export function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function estimateTokens(text) {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
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

export function isPureTextResult(message) {
  return (
    message.role === "toolResult" &&
    !message.isError &&
    Array.isArray(message.content) &&
    message.content.length > 0 &&
    message.content.every((block) => block.type === "text")
  );
}

function textFromResult(message) {
  return message.content.map((block) => block.text).join("\n");
}

/** 归档布局由注入的会话目录决定（对齐 AXIOM 的 `<id>-observations` 清理约定）。 */
export function objectPath(root, id) {
  return join(root, "objects", `${id}.txt`);
}

export function isObservationId(id) {
  return OBSERVATION_ID_PATTERN.test(id);
}

/**
 * 会话内内容寻址：id = hash(toolName, toolCallId, contentHash)。resume 沿用同一目录；
 * 分支重建自己的对象（历史未被改写，原文可再归档）。
 */
export function createObservation(message, root) {
  const text = textFromResult(message);
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes <= THRESHOLD_BYTES) return undefined;
  if (!root) throw new Error("Observation archive directory is unavailable");

  const contentHash = hash(text);
  const id = `obs_${hash(`${message.toolName}\0${message.toolCallId}\0${contentHash}`).slice(0, 24)}`;
  return {
    id,
    contentHash,
    filePath: objectPath(root, id),
    toolName: message.toolName,
    text,
    bytes,
    lines: countLines(text),
    tokens: estimateTokens(text),
  };
}

/**
 * 写入内容寻址路径：O_EXCL 创建，拒绝符号链接；已存在则逐字节校验后才复用。
 */
export async function ensureStored(observation) {
  const directoryPath = dirname(observation.filePath);
  await mkdir(directoryPath, { recursive: true, mode: 0o700 });
  const directoryStats = await lstat(directoryPath);
  if (!directoryStats.isDirectory() || directoryStats.isSymbolicLink()) {
    throw new Error(`Observation directory is not a regular directory for ${observation.id}`);
  }

  let handle;
  try {
    handle = await open(observation.filePath, CREATE_OBJECT_FLAGS, 0o600);
    await handle.writeFile(observation.text, { encoding: "utf8" });
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") throw error;
    const existingHandle = await open(observation.filePath, READ_OBJECT_FLAGS);
    try {
      const existing = await existingHandle.stat();
      if (!existing.isFile()) {
        throw new Error(`Content-addressed observation is not a regular file for ${observation.id}`);
      }
      if (existing.size !== observation.bytes) {
        throw new Error(`Content-addressed observation size mismatch for ${observation.id}`);
      }
      const existingContent = await existingHandle.readFile();
      if (hash(existingContent) !== observation.contentHash) {
        throw new Error(`Content-addressed observation hash mismatch for ${observation.id}`);
      }
    } finally {
      await existingHandle.close();
    }
  } finally {
    await handle?.close();
  }
}

function completeLineExcerpt(text, budgetBytes, fromEnd) {
  const lines = text.split(/(?<=\n)/);
  const selected = [];
  let selectedBytes = 0;
  let index = fromEnd ? lines.length - 1 : 0;

  while (index >= 0 && index < lines.length) {
    const line = lines[index];
    if (line === undefined) break;
    const lineBytes = Buffer.byteLength(line, "utf8");
    if (selectedBytes + lineBytes > budgetBytes) break;
    if (fromEnd) selected.unshift(line);
    else selected.push(line);
    selectedBytes += lineBytes;
    index += fromEnd ? -1 : 1;
  }

  return selected.join("");
}

export function placeholderFor(observation) {
  const headBudget = Math.floor(PLACEHOLDER_EXCERPT_BYTES / 2);
  const tailBudget = PLACEHOLDER_EXCERPT_BYTES - headBudget;
  const head = completeLineExcerpt(observation.text, headBudget, false);
  const tail = completeLineExcerpt(observation.text, tailBudget, true);
  return [
    `[large tool result replaced after its first ${FULL_SENDS} provider requests]`,
    `id: ${observation.id}`,
    `tool: ${observation.toolName}`,
    `original_bytes: ${observation.bytes}`,
    `original_lines: ${observation.lines}`,
    `estimated_tokens: ${observation.tokens}`,
    `retrieve: call obs_recall with {"id":"${observation.id}","offset":0}; continue with returned next_offset`,
    `[first complete lines, up to ${headBudget} bytes]`,
    head,
    `[middle omitted; last complete lines, up to ${tailBudget} bytes]`,
    tail,
    `[${observation.bytes} original bytes omitted]`,
  ].join("\n");
}

function trimUtf8End(buffer, limit) {
  let end = limit;
  while (end > 0 && end < buffer.length && ((buffer[end] ?? 0) & 0xc0) === 0x80) end -= 1;
  return end;
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
    let end = Math.min(bytesRead, limits.maxBytes);
    let newlineCount = 0;

    for (let index = 0; index < end; index += 1) {
      if (buffer[index] !== 0x0a) continue;
      newlineCount += 1;
      if (newlineCount === limits.maxLines) {
        end = index + 1;
        break;
      }
    }

    end = trimUtf8End(buffer, end);
    const chunk = buffer.subarray(0, end);
    const nextOffset = offset + chunk.length;
    return {
      text: chunk.toString("utf8"),
      bytes: chunk.length,
      lines: countBufferLines(chunk),
      nextOffset,
      eof: nextOffset >= fileStats.size,
    };
  } finally {
    await handle.close();
  }
}

// ---------------------------------------------------------------------------
// 度量：进程内统计（面板显示）+ ledger（长期审计，只记状态转换不逐请求记账）。
// ---------------------------------------------------------------------------

export function createObservationStats() {
  return { foldedIds: new Set(), savedTokens: 0, recalls: 0, failures: 0 };
}

export function observationRuntime(stats) {
  if (!stats) return undefined;
  const folded = stats.foldedIds.size;
  return {
    folded,
    savedTokens: stats.savedTokens,
    recalls: stats.recalls,
    failures: stats.failures,
    recallRate: folded ? stats.recalls / folded : 0,
  };
}

function createLedger(root) {
  let directoryReady = false;
  return async (entry) => {
    try {
      if (!directoryReady) {
        await mkdir(root, { recursive: true, mode: 0o700 });
        directoryReady = true;
      }
      await appendFile(join(root, "ledger.jsonl"), `${JSON.stringify({ timestamp: new Date().toISOString(), ...entry })}\n`, "utf8");
    } catch (error) {
      // 度量失败不影响机制本身。
      console.error(`[observation-pack] ledger write failed: ${error?.message ?? error}`);
    }
  };
}

// ---------------------------------------------------------------------------
// 扩展：context 投影 + obs_recall 工具。归档目录由调用方注入（会话存储布局）。
// ---------------------------------------------------------------------------

export function observationPackExtension(root, stats = null) {
  if (!root) throw new Error("observation-pack requires an archive directory");
  return (pi) => {
    const sentCounts = new Map();
    const ledger = createLedger(root);

    pi.registerTool({
      name: "obs_recall",
      label: "Recall Observation",
      description: "Read a stored large tool result by observation id and byte offset.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Observation id from a placeholder" },
          offset: { type: "integer", minimum: 0, description: "Byte offset, default 0" },
        },
        required: ["id"],
        additionalProperties: false,
      },
      async execute(_toolCallId, params) {
        const input = params ?? {};
        if (!isObservationId(input.id)) throw new Error(`Unknown observation id: ${input.id}`);
        if (input.offset != null && !Number.isSafeInteger(input.offset)) {
          throw new Error("obs_recall offset must be a non-negative integer");
        }
        const offset = input.offset ?? 0;
        let chunk;
        try {
          chunk = await readRecallChunk(objectPath(root, input.id), offset, RECALL_LIMITS);
        } catch (error) {
          if (error instanceof Error && "code" in error && error.code === "ENOENT") {
            throw new Error(`Unknown observation id: ${input.id}`);
          }
          throw error;
        }
        const header = [
          `[obs_recall id=${input.id} offset=${offset} next_offset=${chunk.nextOffset} eof=${chunk.eof}]`,
          `[chunk_bytes=${chunk.bytes} chunk_lines=${chunk.lines}; use next_offset to continue]`,
        ].join("\n");
        const content = `${header}\n${chunk.text}`;
        if (Buffer.byteLength(content, "utf8") > RECALL_MAX_BYTES || countLines(content) > RECALL_MAX_LINES) {
          throw new Error("Recall output exceeded its hard limit");
        }
        if (stats) stats.recalls += 1;
        await ledger({
          event: "recall",
          id: input.id,
          offset,
          bytes: chunk.bytes,
          lines: chunk.lines,
          nextOffset: chunk.nextOffset,
          eof: chunk.eof,
        });
        return {
          content: [{ type: "text", text: content }],
          details: {
            id: input.id,
            offset,
            bytes: chunk.bytes,
            lines: chunk.lines,
            nextOffset: chunk.nextOffset,
            eof: chunk.eof,
          },
        };
      },
    });

    pi.on("context", async (event) => {
      const projected = [...event.messages];
      // 每条消息此前参与的请求数 = 其后 assistant 消息数；重启后无需持久状态即可恢复计数。
      const priorAssistantCounts = new Array(event.messages.length);
      let assistantCount = 0;
      for (let index = event.messages.length - 1; index >= 0; index -= 1) {
        priorAssistantCounts[index] = assistantCount;
        if (event.messages[index]?.role === "assistant") assistantCount += 1;
      }

      let savedTokens = 0;
      for (let index = 0; index < event.messages.length; index += 1) {
        const message = event.messages[index];
        if (!message || !isPureTextResult(message)) continue;

        try {
          const observation = createObservation(message, root);
          if (!observation) continue;
          await ensureStored(observation);

          const previousSends = sentCounts.get(observation.id) ?? priorAssistantCounts[index] ?? 0;
          if (previousSends < FULL_SENDS) {
            sentCounts.set(observation.id, previousSends + 1);
            continue;
          }

          const placeholder = placeholderFor(observation);
          const removedTokens = Math.max(0, observation.tokens - estimateTokens(placeholder));
          projected[index] = { ...message, content: [{ type: "text", text: placeholder }] };
          sentCounts.set(observation.id, previousSends + 1);
          savedTokens += removedTokens;
          if (stats) stats.foldedIds.add(observation.id);
          // 只在首次折叠（全文发送结束）时记一笔：ledger 记状态转换，不逐请求重复记账。
          if (previousSends === FULL_SENDS) {
            await ledger({
              event: "fold",
              id: observation.id,
              tool: observation.toolName,
              originalBytes: observation.bytes,
              originalLines: observation.lines,
              originalTokens: observation.tokens,
              placeholderBytes: Buffer.byteLength(placeholder, "utf8"),
              removedTokens,
            });
          }
        } catch (error) {
          // fail-open：折叠失败绝不能让代理丢掉观察结果。
          const reason = error instanceof Error ? error.message : String(error);
          console.error(`[observation-pack] fail-open for tool result: ${reason}`);
          if (stats) stats.failures += 1;
          await ledger({ event: "fail-open", tool: message.toolName, reason });
        }
      }

      if (stats) stats.savedTokens = savedTokens;
      return { messages: projected };
    });
  };
}
