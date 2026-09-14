// 无真实模型/用户数据：node tests/question-preview.mjs，打开 http://127.0.0.1:4327。
import { createServerApp } from "../src/server.js";
import { Sessions } from "../src/sessions.js";

const factory = async (tools) => {
  let listener = () => {}, controller;
  return {
    config: () => ({ model: "preview/question", thinking: "off", levels: ["off"], skills: [] }),
    subscribe: (fn) => { listener = fn; return () => {}; },
    async prompt() {
      controller = new AbortController();
      const tool = tools.find((entry) => entry.name === "question");
      if (!tool) return;
      const toolCallId = `question-${Date.now()}`;
      const args = { questions: [
        { header: "登录方式", question: "使用哪种登录方式？", description: "项目尚无用户系统，需要确定登录方式，这会影响使用门槛和后续维护。", options: [
          { label: "邮箱密码", description: "适用人群广，但需要维护密码存储、验证和找回流程。" },
          { label: "GitHub 登录", description: "不用维护密码，适合开发者用户，但需要 GitHub 账号。" },
        ] },
        { header: "配套功能", question: "需要哪些配套功能？", description: "确认实现范围，可以选择多项，也可以自行补充。", options: [{ label: "自动登录" }, { label: "登录记录" }], multiple: true },
      ] };
      listener({ type: "tool.state", data: { phase: "start", toolCallId, toolName: "question", args } });
      const result = await tool.execute(toolCallId, args, controller.signal);
      listener({ type: "tool.state", data: { phase: "end", toolCallId, toolName: "question", result } });
      listener({ type: "agent.message.end", data: { message: { role: "assistant", content: [{ type: "text", text: `收到工具答案：${result.content[0].text}` }] } } });
    },
    abort: async () => controller?.abort(), dispose: async () => {}, result: () => "已收到答案", historyEntries: () => [],
  };
};
factory.catalog = () => [{ key: "preview/question", provider: "preview", id: "question", name: "Question Preview", levels: ["off"] }];
const sessions = new Sessions(factory);
await sessions.create(process.cwd());
const app = createServerApp(sessions);
const port = Number(process.env.PREVIEW_PORT || 4327);
app.server.listen(port, "127.0.0.1", () => console.log(`Question preview: http://127.0.0.1:${port}`));
