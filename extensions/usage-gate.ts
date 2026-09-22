import { createJiti } from "jiti";
const sdk = createJiti(import.meta.resolve("@earendil-works/pi-coding-agent"));
const { AssistantMessageEventStream } = await sdk.import("@earendil-works/pi-ai");
const { streamSimple } = await sdk.import("@earendil-works/pi-ai/compat");
import { gateLayout, remoteService } from "../src/shared-gate.js";
import { connectGate } from "../src/gate-ipc.js";
import { wrapUsageStream } from "../src/usage-stream.js";

// 显式以 pi -e ./extensions/usage-gate.ts 加载，不修改用户的全局配置。
// 只为配置了限额的供应商注册；未配置供应商仍走 pi 原始路径。
// 勿同时通过 -e 和扩展目录重复加载。
export default function usageGate(pi) {
  let client;
  pi.on("session_start", async (_event, ctx) => {
    try {
      client?.close();
      client = await connectGate(await gateLayout());
      const initial = await client.request("view", {}, 1000);
      const service = remoteService(client, initial);
      const models = ctx.modelRegistry.getAll();
      for (const [provider, limits] of Object.entries(initial.limits)) {
        if (!limits.rpm && !limits.concurrency && !Object.values(limits.models ?? {}).some(limit => limit.concurrency)) continue;
        if (ctx.modelRegistry.getRegisteredNativeProvider(provider)) {
          ctx.ui.notify(`共享限流：${provider} 已被其他扩展接管，跳过以保留原行为`, "warning");
          continue;
        }
        const apis = [...new Set(models.filter(model => model.provider === provider).map(model => model.api))];
        // registerProvider只允许一个api；混用API的供应商不悄悄漏限，明确提示。
        if (!apis.length) { ctx.ui.notify(`共享限流：pi 目录中无 ${provider}，未接入`, "warning"); continue; }
        if (apis.length !== 1) { ctx.ui.notify(`共享限流：${provider} 的 API 不唯一，未接入`, "warning"); continue; }
        const wrapped = wrapUsageStream(streamSimple, { service,
          identity: { source: "external", sessionId: ctx.sessionManager.getSessionId(), agentId: "main" },
          createStream: () => new AssistantMessageEventStream(),
        });
        pi.registerProvider(provider, { api: apis[0], streamSimple: wrapped });
      }
    } catch {
      ctx.ui.notify("共享闸门不可用，本窗口暂不限流、不记录审计", "warning");
    }
  });
  pi.on("session_shutdown", () => { client?.close(); });
}
