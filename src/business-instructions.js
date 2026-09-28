import { createInstructions } from './instructions.js';
import { delegationTools } from './tools.js';
import { registerOperatingGuides, TASK_GUIDE } from './operating-guides.js';
import { TODO_MAIN_RULES } from './todo-prompts.js';

const names = { delegate: 'task.start', read_result: 'task.read', append: 'task.append', cancel_task: 'task.cancel', todo_read: 'todo.read', todo_update: 'todo.update' };
export const instructionText = text => Object.entries(names).reduce((value, [old, name]) => value.replaceAll(old, name), text);
export function createBusinessInstructions(tasks, todo) {
  const registry = createInstructions();
  registerOperatingGuides(registry);
  for (const tool of [...delegationTools(tasks), todo.readTool(), todo.updateTool()]) registry.register({
    name: names[tool.name], description: instructionText(tool.description), parameters: tool.parameters, toolResult: true,
    guidance: tool.name.startsWith('todo_') ? TODO_MAIN_RULES : TASK_GUIDE,
    handler: (args, { toolCallId, signal, onUpdate, ctx }) => tool.execute(toolCallId, args, signal, onUpdate, ctx),
  });
  registry.register({ name: 'memory.query', description: 'Start a read-only Pi task to read global and current-project memory indices and relevant Markdown cards. Returns taskIds; wait for completion notification, then task.read; use task.cancel to stop.', parameters: { type: 'object', properties: { query: { type: 'string', minLength: 1, maxLength: 12000 } }, required: ['query'], additionalProperties: false }, toolResult: true, handler: ({ query }) => { const result = { taskIds: tasks.start([{ task: query, profile: { purpose: 'memory-query' } }]) }; return { content: [{ type: 'text', text: JSON.stringify(result) }], details: result }; } });
  return registry;
}
