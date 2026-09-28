import { TODO_MAIN_RULES, TODO_DELEGATION_RULES } from './todo-prompts.js';

export const TASK_GUIDE = `${TODO_DELEGATION_RULES}
每次委派一个独立可验证的问题，给出背景、范围、成果和停止条件；子代理不能改文件或外部状态，不维护主 Todo。默认工作 10 分钟、收尾 3 分钟，以返回预算为准。收到完成通知后使用对应 taskId/resultId 调用 task.read，不轮询；依赖结果作决策前先读取。运行中通过 task.append 调整；新的调查用 task.start。不再需要时 task.cancel；取消不回滚副作用，未确认停止不能并发续接，续接不清累计耗时。停止后优先利用已有成果，只补必要缺口，不原样反复派发或擅自恢复用户停止的任务。`;
export const GIT_GUIDE = `只对 Git 仓库适用。先查实际主分支；同步最新上游后从最新主分支建工作分支及独立 worktree，无远端才用本地主分支。worktree 位于主仓库的 ../worktrees/<project-name>-<feature-summary>，分支 feat/<feature-summary>。不得直接在主 checkout 或主分支修改/提交，除非用户明确覆盖对应限制。远端同步失败不把旧状态当最新。合并前先在工作分支合入最新主分支、解决冲突并验证；合并回本地主分支前先同步上游，主分支再次变化则重新验证。此规程不授权自动提交、推送或合并；是否执行依用户/项目明确授权。`;
export function registerOperatingGuides(registry) {
  for (const [name, text] of Object.entries({ 'guide.task': TASK_GUIDE, 'guide.todo': TODO_MAIN_RULES, 'guide.git': GIT_GUIDE })) registry.register({ name, description: text, parameters: { type: 'object', properties: {}, additionalProperties: false }, handler: () => ({ text }) });
}
