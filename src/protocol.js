import { z } from "zod";
import { questionAnswers } from "./questions.js";
import { TASK_BUDGET_LIMITS } from "./task-budget.js";

const id = z.string().min(1);
const capabilities = z.object({
  skills: z.array(id), mcp: z.array(id), plugins: z.array(id),
}).strict().nullable();
const workspace = z.string().trim().min(1).optional();
const thinking = z.enum(["off", "minimal", "low", "medium", "high", "xhigh", "max"]).optional();
const queueType = z.enum(["steer", "followUp"]);
// 图片附件：SDK ImageContent（{type:'image',mimeType,data:base64}）。安全上限 4 张、单张 5MiB、共 20MiB。
const base64Pattern = /^[A-Za-z0-9+/]+={0,2}$/;
const decodedBytes = (data) => Buffer.byteLength(data, "base64");
export const promptImage = z
  .object({
    type: z.literal("image"),
    mimeType: z.enum(["image/png", "image/jpeg", "image/gif", "image/webp"]),
    data: z
      .string()
      .min(1, "图片数据不能为空")
      .regex(base64Pattern, "图片数据必须是标准 base64 编码")
      .refine((data) => data.length % 4 === 0, "图片数据必须是标准 base64 编码"),
  })
  .strict();
export const promptImages = z
  .array(promptImage)
  .max(4, "图片最多 4 张")
  .refine((images) => images.every((image) => decodedBytes(image.data) <= 5 * 1024 * 1024), "单张图片不能超过 5 MiB")
  .refine((images) => images.reduce((sum, image) => sum + decodedBytes(image.data), 0) <= 20 * 1024 * 1024, "图片总大小不能超过 20 MiB");
const imageSignatures = {
  "image/png": (bytes) => bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  "image/jpeg": (bytes) => bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])),
  "image/gif": (bytes) => ["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("latin1")),
  "image/webp": (bytes) => bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP",
};
// 解码后校验文件签名，防止改名的非图片文件进入模型上下文。
export function assertPromptImages(images) {
  for (const { mimeType, data } of images ?? []) {
    const check = imageSignatures[mimeType];
    if (!check || !check(Buffer.from(data, "base64")))
      throw new Error("图片内容与声明的格式不符：仅支持真实的 PNG、JPEG、GIF、WebP 文件");
  }
}
export const compactionDefaults = {
  enabled: true, tokenThreshold: 100000, percentThreshold: 50,
  model: null, thinking: "off", keepRecentTokens: 5000,
  syncKeepRecentTokens: 20000, asyncKeepRecentTokens: 5000,
};
export const compaction = z.object({
  enabled: z.boolean(),
  tokenThreshold: z.number().int().positive().max(100000000).nullable(),
  percentThreshold: z.number().positive().max(100).nullable(),
  model: id.nullable(),
  thinking: thinking.unwrap(),
  keepRecentTokens: z.number().int().positive().max(100000000),
  syncKeepRecentTokens: z.number().int().positive().max(100000000).optional(),
  asyncKeepRecentTokens: z.number().int().positive().max(100000000).optional(),
}).strict().refine((value) => !value.enabled || value.tokenThreshold !== null || value.percentThreshold !== null,
  "启用自动压缩时至少设置一个触发阈值");
// 压缩等级是偏好，不应阻断首次建会话/恢复/换模型；不兼容时使用模型最低支持等级。
// 仍严格校验输入，且不修改保存的默认值；返回本次实际配置。
export function resolveCompaction(value, levels) {
  const config = compaction.parse(value ?? compactionDefaults);
  if (config.enabled && levels && !levels.includes(config.thinking)) {
    if (!levels.length) throw new Error("压缩模型没有可用的思考等级，请检查模型配置");
    config.thinking = levels[0];
  }
  return config;
}

// 重试错误词表：字符串子串匹配（大小写不敏感）。nonRetryable 优先于 retryable，二者都优先于内建判定。
export const retryPatterns = z
  .object({
    retryable: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
    nonRetryable: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
  })
  .strict();
export const selection = z.object({
  compaction: compaction.optional(),
  retry: retryPatterns.nullable().optional(),
  queueType: queueType.optional(),
  model: id.nullable().optional(),
  subagentModel: id.nullable().optional(),
  capabilities: capabilities.optional(),
  subagentCapabilities: z.union([capabilities, z.literal("inherit")]).optional(),
  thinking: thinking.unwrap().nullable().optional(),
  subagentThinking: thinking.unwrap().nullable().optional(),
});
// 摘要记忆参数：独立命令读写（SQLite 持久化，不进 selection / JSON 默认配置体系）。
// 边界与 task-budget.js 共用 TASK_BUDGET_LIMITS，规则验证一致。
export const taskBudget = z.object({
  maxTurns: z.number().int().min(TASK_BUDGET_LIMITS.turns[0]).max(TASK_BUDGET_LIMITS.turns[1]),
  wrapUpWindow: z.number().int().min(TASK_BUDGET_LIMITS.window[0]).max(TASK_BUDGET_LIMITS.window[1]),
  workSeconds: z.number().int().min(TASK_BUDGET_LIMITS.workSeconds[0]).max(TASK_BUDGET_LIMITS.workSeconds[1]).optional(),
  wrapUpSeconds: z.number().int().min(TASK_BUDGET_LIMITS.wrapUpSeconds[0]).max(TASK_BUDGET_LIMITS.wrapUpSeconds[1]).optional(),
  summarySeconds: z.number().int().min(TASK_BUDGET_LIMITS.summarySeconds[0]).max(TASK_BUDGET_LIMITS.summarySeconds[1]).optional(),
}).strict();
// —— 模型配置（models.json）与收藏，协议：docs/model-config-protocol.md ——
export const providerKey = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/, "供应商 id 只能包含字母、数字与 ._-");
export const modelKey = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((value) => !/[\0\r\n]/.test(value), "模型 id 含非法字符");
// 密钥写入值：字符串=新值（服务端拒绝 ！ 前导命令型）、{keep:true}=保留现值、null=删除；读取时以 {masked:true,kind} 脱敏。
export const secretValueIn = z.union([
  z.string().max(4096),
  z.object({ keep: z.literal(true) }).strict(),
  z.null(),
]);
const secretHeadersIn = z.record(z.string().min(1).max(256), secretValueIn);
const thinkingLevelMapIn = z.object(
  Object.fromEntries(
    ["off", "minimal", "low", "medium", "high", "xhigh", "max"].map((level) => [
      level,
      z.union([z.string().max(200), z.null()]).optional(),
    ]),
  ),
);
const costIn = z.object({
  input: z.number().min(0).max(1e6).optional(),
  output: z.number().min(0).max(1e6).optional(),
  cacheRead: z.number().min(0).max(1e6).optional(),
  cacheWrite: z.number().min(0).max(1e6).optional(),
  tiers: z
    .array(
      z.object({
        inputTokensAbove: z.number().min(0).max(1e9),
        input: z.number().min(0).max(1e6),
        output: z.number().min(0).max(1e6),
        cacheRead: z.number().min(0).max(1e6),
        cacheWrite: z.number().min(0).max(1e6),
      }),
    )
    .max(20)
    .optional(),
});
// 保存为合并语义：未知顶层字段原样保留；models/modelOverrides 由独立命令管理，出现即拒绝。
export const providerConfigIn = z
  .object({
    name: z.string().trim().min(1).max(120).optional().nullable(),
    baseUrl: z.string().trim().min(1).max(2048).optional().nullable(),
    apiKey: secretValueIn.optional(),
    api: z.string().trim().min(1).max(64).optional().nullable(),
    // oauth 只允许 "radius"。不用 z.literal：它的 invalid_literal issue 会把收到的原值放进
    // received 字段，而 server.js 把整条 message 原样回传客户端（错误信息不得携带原文片段）。
    oauth: z.string().refine((value) => value === "radius", "oauth 只支持 radius").optional().nullable(),
    authHeader: z.boolean().optional().nullable(),
    headers: secretHeadersIn.optional().nullable(),
    compat: z.record(z.string(), z.unknown()).optional().nullable(),
  })
  .passthrough()
  .refine(
    (provider) => !("models" in provider) && !("modelOverrides" in provider),
    "模型列表请使用 models.model.save / models.model.delete 管理",
  );
export const modelConfigIn = z
  .object({
    id: modelKey,
    name: z.string().trim().min(1).max(200).optional().nullable(),
    api: z.string().trim().min(1).max(64).optional().nullable(),
    baseUrl: z.string().trim().min(1).max(2048).optional().nullable(),
    reasoning: z.boolean().optional().nullable(),
    thinkingLevelMap: thinkingLevelMapIn.optional().nullable(),
    input: z.array(z.enum(["text", "image"])).max(8).optional().nullable(),
    cost: costIn.optional().nullable(),
    contextWindow: z.number().int().positive().max(1e9).optional().nullable(),
    maxTokens: z.number().int().positive().max(1e9).optional().nullable(),
    samplingParams: z.record(z.string(), z.unknown()).optional().nullable(),
    headers: secretHeadersIn.optional().nullable(),
    compat: z.record(z.string(), z.unknown()).optional().nullable(),
  })
  .passthrough();
export const modelOverrideIn = modelConfigIn.omit({ id: true, api: true, baseUrl: true }).strict();
const fingerprintIn = z.string().min(1).max(128);
export const command = z.discriminatedUnion("type", [
  z.object({ id, type: z.literal('todo.action'), sessionId: id, action: z.enum(['pause', 'resume']) }).strict(),
  z.object({ id, type: z.literal("goal.action"), sessionId: id,
    action: z.enum(["enter", "confirm", "adjust", "pause", "resume", "restart", "exit"]),
    text: z.string().max(30000).optional(),
  }).strict(),
  z.object({ id, type: z.literal("service.status") }).strict(),
  z.object({ id, type: z.literal("service.update.check") }).strict(),
  z.object({ id, type: z.literal("service.restart"), mode: z.enum(["quick", "rebuild", "update"]), sha: z.string().regex(/^[0-9a-f]{40}$/i).optional() }).strict(),
  // 远程访问（Tailscale）：get 本地/远程均可读；configure/login 仅限本地连接（server.js 内拦截远程）。
  z.object({ id, type: z.literal("remote.get") }).strict(),
  z.object({ id, type: z.literal("remote.login") }).strict(),
  z
    .object({
      id,
      type: z.literal("remote.configure"),
      enabled: z.boolean(),
      email: z.string().trim().max(254),
    })
    .strict(),
  z
    .object({
      id,
      type: z.literal("session.rename"),
      sessionId: id,
      title: z.string().trim().min(1).max(120),
    })
    .strict(),
  z.object({ id, type: z.literal("workspace.reveal"), sessionId: id }).strict(),
  // query 非空时按名称模糊递归搜索整个工作空间（@ 补全用）。
  z.object({ id, type: z.literal("workspace.browse"), sessionId: id, path: z.string().max(4096).default(""), query: z.string().max(200).default("") }).strict(),
  // 统一文件浏览：sessionId 存在则限定工作空间（相对路径），否则浏览主机绝对目录（工作空间选择器）。
  z
    .object({
      id,
      type: z.literal("files.browse"),
      sessionId: id.optional(),
      path: z.string().max(4096).optional(),
      directoriesOnly: z.boolean().optional(),
      offset: z.number().int().nonnegative().optional(),
      query: z.string().max(200).optional(),
    })
    .strict(),
  z.object({ id, type: z.literal("models.list") }).strict(),
  z.object({ id, type: z.literal("models.config.get") }).strict(),
  z
    .object({
      id,
      type: z.literal("models.provider.save"),
      providerId: providerKey,
      provider: providerConfigIn,
      baseFingerprint: fingerprintIn,
    })
    .strict(),
  z
    .object({
      id,
      type: z.literal("models.provider.delete"),
      providerId: providerKey,
      baseFingerprint: fingerprintIn,
    })
    .strict(),
  z
    .object({
      id,
      type: z.literal("models.provider.rename"),
      providerId: providerKey,
      newProviderId: providerKey,
      baseFingerprint: fingerprintIn,
    })
    .strict(),
  z
    .object({
      id,
      type: z.literal("models.model.save"),
      providerId: providerKey,
      model: modelConfigIn,
      baseFingerprint: fingerprintIn,
    })
    .strict(),
  z
    .object({
      id,
      type: z.literal("models.model.delete"),
      providerId: providerKey,
      modelId: modelKey,
      baseFingerprint: fingerprintIn,
    })
    .strict(),
  // 只读：从供应商在线拉取模型列表（models.provider.discover）；不写盘、不自动启用。
  z.object({ id, type: z.literal("models.provider.discover"), providerId: providerKey }).strict(),
  z.object({ id, type: z.literal("models.favorites.get") }).strict(),
  z.object({ id, type: z.literal("models.model.override"), providerId: providerKey, modelId: modelKey, override: modelOverrideIn, baseFingerprint: fingerprintIn }).strict(),
  z.object({ id, type: z.literal("models.auth.list") }).strict(),
  z.object({ id, type: z.literal("models.auth.start"), providerId: providerKey, authType: z.enum(["api_key", "oauth"]) }).strict(),
  z.object({ id, type: z.literal("models.auth.status"), flowId: id }).strict(),
  z.object({ id, type: z.literal("models.auth.respond"), flowId: id, promptId: id, value: z.string().min(1).max(8192) }).strict(),
  z.object({ id, type: z.literal("models.auth.cancel"), flowId: id }).strict(),
  z.object({ id, type: z.literal("models.auth.logout"), providerId: providerKey }).strict(),
  // 内置目录可见性（Axiom 侧隐藏/恢复，不改 Pi 运行时目录）：key = 供应商 id 或 `provider/id`。
  z
    .object({
      id,
      type: z.literal("models.hidden.set"),
      key: z.string().trim().min(1).max(300),
      hidden: z.boolean(),
    })
    .strict(),
  z
    .object({
      id,
      type: z.literal("models.favorites.set"),
      kind: z.enum(["provider", "model", "thinking"]),
      key: z.string().trim().min(1).max(300),
      favorite: z.boolean(),
    })
    .strict(),
  z.object({
    id, type: z.literal("capabilities.list"),
    cwd: workspace, trustProject: z.boolean().optional(),
  }).strict(),
  // 会话默认配置：带 cwd 读写该工作目录的独立配置，不带 cwd 读写全局兜底；list/delete 管理目录条目。
  z.object({ id, type: z.literal("session.defaults.get"), cwd: workspace }).strict(),
  selection.extend({ id, type: z.literal("session.defaults.configure"), cwd: workspace }).strict(),
  z.object({ id, type: z.literal("session.defaults.list") }).strict(),
  z.object({ id, type: z.literal("session.defaults.delete"), cwd: z.string().trim().min(1).max(4096) }).strict(),
  z.object({ id, type: z.literal("usage.backfill") }).strict(),
  z.object({ id, type: z.literal("usage.get"), sessionId: id.optional(), provider: id.optional(), status: id.optional(), before: z.number().finite().optional(), beforeId: id.optional(), limit: z.number().int().min(1).max(100).optional() }).strict(),
  z.object({ id, type: z.literal("usage.configure"), limits: z.record(z.string().min(1).max(200), z.object({ rpm: z.number().int().min(0).max(100000).optional(), concurrency: z.number().int().min(0).max(100000).optional() }).strict()) }).strict(),
  z.object({ id, type: z.literal("task.budget.get") }).strict(),
  z.object({ id, type: z.literal("task.budget.configure"), budget: taskBudget }).strict(),
  z
    .object({
      id,
      type: z.literal("session.configure"),
      sessionId: id,
      model: id,
      subagentModel: id.nullable().optional(),
      subagentThinking: thinking.unwrap().nullable().optional(),
      thinking,
      compaction: compaction.optional(),
      queueType: queueType.optional(),
      capabilities: capabilities.optional(),
      subagentCapabilities: z.union([capabilities, z.literal("inherit")]).optional(),
      retry: retryPatterns.nullable().optional(),
    })
    .strict(),
  z.object({ id, type: z.literal("sessions.list") }).strict(),
  selection
    .extend({
      id,
      type: z.literal("session.create"),
      cwd: workspace,
      useDefaults: z.boolean().optional(),
      trustProject: z.boolean().optional(),
    })
    .strict(),
  // 导入 pi 的 .jsonl 会话文件：服务端路径，复制进本实例存储后作为新会话打开。
  z.object({ id, type: z.literal("session.import"), path: z.string().trim().min(1).max(4096), cwd: z.string().trim().min(1).max(4096).optional() }).strict(),
  // 复制本实例已有会话：主历史与子任务历史复制成新会话，标题原名接序号（xxx → xxx 1）。
  z.object({ id, type: z.literal("session.duplicate"), sessionId: id }).strict(),
  z.object({ id, type: z.literal("session.attach"), sessionId: id }).strict(),
  // 压缩卡按需展开：attach 下发的历史不含被摘要折叠的消息，点开摘要卡时才取这一段原文。
  z.object({ id, type: z.literal("session.compaction.messages"), sessionId: id, compactionId: z.string().min(1).max(256) }).strict(),
  // 取消当前在途的后台摘要（压缩进程面板的取消按钮）；runId 用于对得上哪一次，防陈旧 id 误杀新任务。
  z.object({ id, type: z.literal("session.compaction.cancel"), sessionId: id, runId: z.string().min(1).max(256).optional() }).strict(),
  z.object({ id, type: z.literal("session.compaction.attempt"), sessionId: id, runId: z.string().min(1).max(256), knownRequests: z.number().int().min(0).optional(), revision: z.number().int().min(0).optional() }).strict(),
  z.object({ id, type: z.literal("session.compaction.start"), sessionId: id, mode: z.enum(["sync", "async"]) }).strict(),
  // 运行中重新发现项目技能（composer 打开技能列表时调用）；返回 { skills: [{name, description}] }。
  z.object({ id, type: z.literal("session.skills.refresh"), sessionId: id }).strict(),
  z.object({ id, type: z.literal("session.close"), sessionId: id }).strict(),
  z
    .object({
      id,
      type: z.literal("prompt"),
      sessionId: id,
      // text 与 images 的“不能双空”检查放在 sessions.prompt：zod v3 discriminatedUnion 成员不支持 object 级 refine。
      text: z.string().trim(),
      images: promptImages.optional(),
      queueType: queueType.optional(),
    })
    .strict(),
  // mode 缺省为 force：保持旧客户端语义（立即 abort）。safe 表示停在下一个轮次边界，不丢产出。
  z.object({ id, type: z.literal("cancel"), sessionId: id, mode: z.enum(["force", "safe"]).default("force") }).strict(),
  z.object({ id, type: z.literal("question.reply"), sessionId: id, toolCallId: z.string().min(1).max(256), answers: questionAnswers }).strict(),
  // 手动重试：不带新输入，续跑上一次异常停止（Esc 停止/终态错误/重试用尽）的请求。
  z.object({ id, type: z.literal("session.retry"), sessionId: id }).strict(),
  z.object({ id, type: z.literal("task.retry"), sessionId: id, taskId: id }).strict(),
  z.object({ id, type: z.literal("task.cancel"), sessionId: id, taskId: id, mode: z.enum(["summary", "immediate"]).default("summary"), reason: z.string().max(4000).default("") }).strict(),
  z.object({ id, type: z.literal("queue.withdraw"), sessionId: id, recall: z.boolean().optional() }).strict(),
  z
    .object({
      id,
      type: z.literal("tasks.read"),
      sessionId: id,
      taskId: id,
      resultId: z.string().uuid(),
    })
    .strict(),
]);
