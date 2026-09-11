import assert from "node:assert/strict";
import { createPiFactory } from "../src/pi.js";
import { Sessions } from "../src/sessions.js";

const TIMEOUT = 10 * 60_000;

const sessions = new Sessions(
  await createPiFactory({ cwd: process.cwd(), model: process.env.AXIOM_MODEL }),
);
try {
  const id = await sessions.create();
  const item = sessions.get(id);
  sessions.prompt(
    id,
    'Call delegate exactly once with two tasks: "Reply with AXIOM_A only; do not use tools" and "Reply with AXIOM_B only; do not use tools". Do not poll and do not read results before the task completion notification arrives. When the notification arrives, call read_result once with each taskId and the resultId from the notification, then summarize both replies. Do not read or change files.',
  );
  // 任务完成通知会在主运行结束后派生后续 run：不能只等首个 item.work，
  // 需用事件 + 超时等通知 run 产出包含两个子任务回复的最终汇总。
  await new Promise((resolve, reject) => {
    let unsubscribe;
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error(`等待任务完成通知后的最终汇总超时（${TIMEOUT}ms）：${JSON.stringify(item.tasks.snapshot())}`));
    }, TIMEOUT);
    unsubscribe = sessions.subscribe(id, () => {
      const tasks = item.tasks.snapshot();
      if (!(tasks.length === 2 && tasks.every((task) => task.status === "completed" && task.resultId))) return;
      const reads = item.messages.filter((record) => record.agentId === "main")
        .flatMap((record) => record.message.content ?? [])
        .filter((block) => block?.type === "toolCall" && block.name === "read_result");
      if (!tasks.every((task) => reads.some((call) => call.arguments?.taskId === task.id && call.arguments?.resultId === task.resultId))) return;
      const texts = item.messages
        .filter((record) => record.agentId === "main" && record.message.role === "assistant")
        .flatMap((record) => record.message.content ?? [])
        .filter((content) => content?.type === "text")
        .map((content) => content.text)
        .join("");
      if (!(texts.includes("AXIOM_A") && texts.includes("AXIOM_B"))) return;
      clearTimeout(timer);
      unsubscribe();
      resolve(texts);
    });
  });
  const tasks = item.tasks.snapshot();
  assert.equal(tasks.length, 2);
  assert(
    tasks.every((task) => task.status === "completed"),
    JSON.stringify(tasks),
  );
  assert(tasks.some((task) => task.text.includes("AXIOM_A")));
  assert(tasks.some((task) => task.text.includes("AXIOM_B")));
  const reads = item.messages
    .filter((record) => record.agentId === "main")
    .flatMap((record) => record.message.content ?? [])
    .filter((content) => content?.type === "toolCall" && content.name === "read_result");
  assert(reads.length > 0, "通知后必须调用 read_result");
  assert(
    reads.some((call) => JSON.stringify(call).includes("resultId")),
    "read_result 必须携带通知中的 resultId",
  );
  console.log(
    "PASS: main agent -> delegate -> notification -> read_result(resultId) -> summary",
  );
} finally {
  await sessions.close();
}
