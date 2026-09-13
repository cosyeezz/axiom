import { z } from "zod";
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
  enabled: false, tokenThreshold: 100000, percentThreshold: 70,
  model: null, thinking: "off", keepRecentTokens: 20000,
};
export const compaction = z.object({
  enabled: z.boolean(),
  tokenThreshold: z.number().int().positive().max(100000000).nullable(),
  percentThreshold: z.number().positive().max(100).nullable(),
  model: id.nullable(),
  thinking: thinking.unwrap(),
  keepRecentTokens: z.number().int().positive().max(100000000),
}).strict().refine((value) => !value.enabled || value.tokenThreshold !== null || value.percentThreshold !== null,
  "启用自动压缩时至少设置一个触发阈值");
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
}).strict();
// 具名会话预设：沿用 selection schema；trustProject/useDefaults 不在 schema 内，保存即剥离。
export const preset = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  cwd: workspace,
  selection,
}).strict();
export const presetStore = z.object({ presets: z.array(preset) }).strict();
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
    oauth: z.literal("radius").optional().nullable(),
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
  z.object({ id, type: z.literal("session.defaults.get"), cwd: workspace }).strict(),
  selection.extend({ id, type: z.literal("session.defaults.configure"), cwd: workspace }).strict(),
  z.object({ id, type: z.literal("task.budget.get") }).strict(),
  z.object({ id, type: z.literal("task.budget.configure"), budget: taskBudget }).strict(),
  z.object({ id, type: z.literal("session.presets.list") }).strict(),
  z
    .object({
      id,
      type: z.literal("session.presets.save"),
      presetId: z.string().uuid().optional(),
      name: z.string().trim().min(1).max(80),
      cwd: workspace,
      selection,
    })
    .strict(),
  z.object({ id, type: z.literal("session.presets.delete"), presetId: z.string().uuid() }).strict(),
  z
    .object({
      id,
      type: z.literal("session.configure"),
      sessionId: id,
      model: id,
      subagentModel: id.nullable().optional(),
      thinking,
      compaction: compaction.optional(),
      queueType: queueType.optional(),
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
  z.object({ id, type: z.literal("session.attach"), sessionId: id }).strict(),
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
  z.object({ id, type: z.literal("cancel"), sessionId: id }).strict(),
  // 手动重试：不带新输入，续跑上一次异常停止（Esc 停止/终态错误/重试用尽）的请求。
  z.object({ id, type: z.literal("session.retry"), sessionId: id }).strict(),
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
