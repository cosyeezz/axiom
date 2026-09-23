/**
 * Axiom 统一 Todo：执行方案配套固定文案（v1.0，2026-09-23）。
 * 仅包含提示词、工具描述和纯文本构造函数，不实现权限、SQL、调度或 SDK 接线。
 * 主代理文案并入 src/prompts.js；不要把本文件直接当成完整功能补丁。
 */

export const TODO_MAIN_RULES = `Todo task tracking:
- Todo 是统一的任务能力，不因是否从 Goal 入口进入而改变规则。简单问答不必创建清单；需要持续推进的多步骤工作可创建清单。Goal 入口要求先明确要求、创建并确认一级目标，再开始实施。
- 一级目标写用户要的交付结果，并在 description 中保留范围和约束，在 acceptance 中写可核对的完成标准。目标应允许调整实现方法，但不能宽泛到无法判断是否交付。不要把用户未要求的扩展工作加入目标。
- 创建一级目标或变更已确认的一级标题、说明、验收标准、增删目标，使用 todo_update 提出完整变更；工具会请求用户确认。只有工具返回 applied:true 才表示变更生效。不得以删除重建、降级、重新打开、改摘要或新建清单绕过确认。
- 二级事项是实现步骤，可以在一级要求范围内自行增删改和重排。开始实质步骤、完成实际结果、发现阻塞或改变实现路径时批量更新，不要在每次工具调用后维护清单。
- description 和 acceptance 表示要求，summary 表示实际实施过程及结果，blocker 表示当前真实阻塞；不能用过程摘要覆盖要求。保持记录简短，详细输出用已有结果引用，不复制整段工具原文。
- 清单创建并确认后，只要仍有可推进的未完成目标，就继续实际工作，直至逐项验收完成。不要以已提交计划、已委派、做了部分工作、切换界面或回复了总结为结束理由。固定轮次数和 Todo 读取次数不是任务已结束或受阻的依据。
- 子项全部完成不等于一级目标完成。标记一级 done 前，核对其全部验收标准，记录实际结果和对应依据；保留的子项必须已完成。未验证不能写成验证通过，工具调用成功不等于目标达成，不能以 Todo 自己的读写返回自证完成。
- 真正受阻时记录缺少什么、已尝试什么、需要谁采取什么行动；还有其他不受影响的目标就继续。需要用户决策使用 question，不要把等待子任务写成永久阻塞。子任务结束、失败或达到自身预算，不自动代表主目标完成或无法继续；先利用已有成果，只补必要缺口。
- 用户暂停、停止或取消优先。普通输入、更新清单、子任务通知和打开 Goal 面板不能解除用户暂停；遵循系统提供的显式恢复状态。不得为了完成 Todo 擅自取得额外权限、绕过限制或反复重放有副作用的操作。
- todo_read 和 todo_update 返回是 SQLite 状态投影。已有包含所需字段的当前版本返回时直接复用；只在缺少相关内容、版本冲突或恢复后缺少权威状态时按需读取。部分返回不代表完整清单；不要为了确认、等待或凑进度反复读取、改名、重排。
- 压缩后收到的任务状态来自 SQLite，不从摘要、旧消息或记忆重建和覆盖清单。先依据当前一级要求与现有成果继续；状态包已包含的信息不必再次查询。
- 子代理不维护主清单。委派时传递对应目标、边界、验收要求和具体步骤；收到结果后由主代理核对并更新。没有不依赖子任务结果的工作时，可以结束当前回复等待通知，但不能把主任务标记完成。
- 所有一级目标验收完成后，在当前回复中交付成果、必要依据及真实限制；不要为了补写清单额外启动一轮，也不要自行追加新目标。`;

export const TODO_DELEGATION_RULES = `- 委派属于 Todo 的工作时，在现有 context/tasks[].task 中写明对应一级目标的范围、约束、验收要求和本次具体问题。不要给子代理整份清单或要求其维护主任务；子代理的完成通知只表示执行结束，主代理核对实际结果后再更新 Todo。`;

export const TODO_RESPONSE_RULES = `Response format and execution:
- Place each complete final response, including clarification questions and failure reports, inside exactly one pair of <axiom_display>...</axiom_display> tags. Put each opening and closing tag on its own line, outside code blocks. Do not wrap progress updates in these tags.
- These tags are required for UI parsing and display. They do not indicate Todo completion and must not be used as task-state signals.
- 对于需要行动的任务，持续执行到要求完成并核对，或遇到真实阻塞、用户中断。已有 Todo 时，以已确认的一级要求作为交付范围；不能用应答、重述计划、部分成果或承诺继续代替完成。
- 当仅剩等待已启动子任务、用户回答或系统正在处理的操作时，可以给出简短状态并结束当前回复，由正常事件继续；这只是让出当前执行，不是结束任务。
- 全部目标通过验收后，在当前回复交付结果。不要输出旧的 Goal/轮次完成标记，也不要为了写完成标记另起一轮。`;

export const GOAL_PREPARE_PROMPT = `[Axiom 明确目标]
用户要求先建立任务清单再执行。先根据本次要求和已有对话确认交付结果、必要约束与可核对的完成标准；缺少会影响执行的关键信息时，用 question 合并提问，不重复询问已经明确的信息。
信息足够后，用 todo_update 创建一级目标并等待工具内的用户确认。一级目标描述结果而非固定实现方法；不要先展开实施、创建分轮计划或调用旧 Goal 工具。没有足够信息设定修复结果时，可向用户确认一个边界明确的调查目标，不擅自猜测。
目标确认生效后，自行拆分必要二级步骤并继续执行，直到验收完成、真正受阻或用户中断。`;

export const TODO_CONTINUE_PROMPT = `[Axiom 任务继续] 当前清单仍有可推进的未完成目标。继续下一项实际工作，并按对应一级验收标准核对结果。`;

export const TODO_RESUME_PROMPT = `[Axiom 任务恢复] 用户已显式恢复。先核对保存的目标、实际产物和中断工作，确认哪些步骤仍需完成；不要盲目重放操作。阻塞已解除则更新对应状态并继续，未解除则说明具体原因。`;

export const TODO_DELIVERY_RETRY_PROMPT = `[Axiom 结果交付] 清单中的目标已完成验收，但上次结果回复未正常交付。只依据现有成果补充交付，不重新执行已完成的工作，不添加新目标。`;

export const TODO_CONTEXT_PREFIX = `[Axiom 当前任务状态]
以下是从 SQLite 读取的当前状态，不是压缩摘要中的旧计划。按已确认的一级要求及已有成果继续；description/acceptance 是要求，summary/verification 是实施和验收记录。用户最新指令与暂停优先，缺少的详情按 ID 读取，不必重复查询已包含的信息。`;

export const TODO_RUNTIME_BLOCK_PREFIX = `[Axiom 执行阻塞] 当前执行不能继续，任务没有被标记完成。已成功保存的进度仍是恢复依据；当前错误不代表回滚。`;

export const TODO_READ_DESCRIPTION = `读取当前会话的统一任务清单。默认返回当前清单头、统计、一级目标概览和少量未完成步骤；id 读取指定事项及其步骤，detail:true 读取完整目标定义和简短过程记录，section:verification 分页读取验收明细，includeDeleted:true 查询已移除记录，listId 可查看本会话其他清单。大清单按返回的 nextOffset/limit/hasMore 分页。coverage 表示本次包含的事项和字段，不代表完整清单。已有包含相关字段的当前版本返回时直接复用，不为确认或等待重复读取。只读操作不会推进版本、执行任务或解除暂停。`;

export const TODO_UPDATE_DESCRIPTION = `主代理用此工具维护统一的两级 Todo。使用 listId、baseVersion、必要的 reason 和 ops 批量提交 add/edit/status/move/delete/reopen；description/acceptance 是要求，summary 是简短实施结果，blocker 是阻塞原因。一级目标新增、删除及 title/description/acceptance 变更会在本工具内请求用户确认；applied:true 才表示提交成功，不能传入 approved 等自我授权字段。一级定义变更单独成批，不与进度或二级操作混批。二级步骤可在一级范围内自行调整，level/parentId 创建后不能通过 edit 改变。done 的一级目标不能由子项自动汇总产生，必须满足全部验收标准并提交 verification；blocked 必须给出非空 blocker。完成、受阻、暂停含义不同。一次创建和确认的清单需要持续完成，不得用删除、新清单或 Goal UI 绕过。返回为有界变更和版本，可直接用于下一次更新；不包含的详情按需读取。`;

export const TODO_FIELD_DESCRIPTIONS = Object.freeze({
  listId: '当前会话内的清单 ID；更新已有清单必须使用返回的 ID。首次创建可省略。',
  baseVersion: '最近一次权威返回的清单内容版本；首次创建为 0。调度计数不改变此版本。',
  id: '事项稳定 ID，不是位置序号；可在 add 时指定，供后续操作引用。',
  level: '事项层级：1 为用户目标，2 为实现步骤。只在创建时填写，不能通过修改层级绕过目标保护。',
  parentId: '二级事项所属的一级 ID；一级为 null。创建后不通过 edit 改归属。',
  title: '简短、可理解的目标或步骤名称，最多 160 字符。',
  description: '要求说明：一级写范围与约束，二级写具体步骤；最多 2000 字符。不是进展日志。',
  acceptance: '完成标准数组，每项包含稳定 criterionId、text 和 check。一级至少一项，check 为 tool/review/user，默认 review；用户确认后不能自行降低要求。',
  summary: '实际实施过程和结果摘要，最多 800 字符。不要重复全部目标、保存思维过程或粘贴工具全文。',
  blocker: '真实阻塞及解除条件，最多 600 字符。等待已运行子任务不作为永久阻塞。',
  verification: '完成核对记录：逐条引用 criterionId，写 result 及必要 refs；检查方法由已确认的 acceptance 决定，不能在这里降级。',
  reason: '一级变更、删除或重新打开的简短原因，最多 600 字符。原因本身不构成用户授权。',
  beforeId: '同级同父项内排到哪个事项之前；省略表示放到该组末尾。',
  detail: 'true 返回所请求主体的完整目标定义和简短过程记录；默认概览不代表已拿到完整验收要求。',
  section: 'item 返回事项信息，verification 分页返回完整验收记录；默认 item，复用 offset/limit。',
  includeDeleted: '是否包含已移除事项，默认 false；查询历史不会重新启用旧任务。',
});

export const TODO_ERROR_TEXT = Object.freeze({
  TODO_VERSION_CONFLICT: '清单内容已变化，本次没有写入。请读取返回的相关事项后使用当前版本重新提交。',
  TODO_APPROVAL_STALE: '确认期间相关清单已变化，本次确认未提交任何修改。请重新提出准确的变更内容。',
  TODO_APPROVAL_CANCELLED: '确认已取消，目标没有改变。不要把取消当作批准或自动重发同一提案。',
  TODO_APPROVAL_REJECTED: '用户未批准本次目标内容，清单未修改。请依据用户反馈处理，不重复请求相同确认。',
  TODO_MIXED_APPROVAL_BATCH: '一级定义变更必须单独成批；请将步骤或进度更新另行提交。',
  TODO_INVALID_OPERATION_FIELDS: '操作包含不适用的字段，本批次未修改。请按对应操作的字段要求提交。',
  TODO_GOAL_NOT_CONFIRMED: '先使用 question 明确要求，再用 todo_update 创建并确认一级目标；确认前不能开始实施。',
  TODO_GOAL_UNFINISHED: '已有未完成目标，不能通过另建清单替代。请继续、说明真实阻塞，或请求用户变更目标。',
  TODO_ACCEPTANCE_INCOMPLETE: '一级目标尚未满足完成条件，本次没有标记完成。请处理返回的未完成步骤或缺少的验收记录。',
  TODO_CONTEXT_UNAVAILABLE: '当前任务状态读取失败，未使用旧摘要替代。执行暂时阻塞，清单与已有成果保持不变。',
  TODO_READ_TOO_LARGE: '请求范围过大，请按 ID 或分页读取；本次没有静默截断完整目标要求。',
});

export const TODO_UI_TEXT = Object.freeze({
  goalButton: 'Goal',
  goalTooltip: '先明确目标并创建任务清单，确认后持续执行。',
  waitingObjective: '等待填写目标',
  waitingConfirmation: '待确认目标',
  emptyPreparationHint: '描述希望完成的事情；必要时模型会提问，再请你确认目标。',
  title: 'Todo',
  targetCount: '目标',
  stepCount: '步骤',
  pending: '待处理',
  running: '进行中',
  blocked: '受阻',
  done: '已完成',
  awaitingAcceptance: '步骤已完成，待目标验收',
  pause: '暂停',
  resume: '恢复',
  paused: '已暂停',
  verifyAgain: '需重新核对',
  showDetails: '查看详情',
  loadMore: '显示更多',
  removed: '已移除',
  cancelled: '已取消，未完成',
  closePreparation: '取消创建',
  restartReason: '执行因服务重启中断，请核对已有产物后恢复。',
  readonlyRequirement: '目标要求已确认；修改需再次确认。',
  deliveryFailed: '目标已验收，结果回复未正常交付。',
});

const APPROVAL_COPY = Object.freeze({
  create: {
    header: '确认目标',
    question: '是否按下面的目标开始执行？',
    description: '请核对目标、范围、约束和验收标准。确认后模型可调整二级实现步骤，但不能自行改变一级要求；任务会持续执行到完成、真实阻塞或你主动中断。',
    accept: '确认并开始', reject: '暂不开始',
  },
  change: {
    header: '调整目标',
    question: '是否同意这次一级目标变更？',
    description: '下方显示实际修改前后的内容。只有这份变更会被提交，未展示的要求不变。确认后相关完成判定需要重新核对；拒绝则保留原目标。',
    accept: '同意本次变更', reject: '保留原目标',
  },
  remove: {
    header: '移除目标',
    question: '是否移除下面的目标及其步骤？',
    description: '移除表示不再要求执行，不表示已经完成。已有实施记录仍可查询；移除全部目标会显示已取消，而不是全部完成。',
    accept: '同意移除', reject: '保留目标',
  },
  acceptance: {
    header: '验收结果',
    question: '下面的结果是否满足已确认的用户验收要求？',
    description: '这次确认只针对下方展示的目标版本、验收标准和实际产物。选择通过才记录对应用户验收；不通过则保留未完成状态。',
    accept: '验收通过', reject: '尚未通过',
  },
});

/** 只生成普通 question 文案。完整 proposal 数据须由服务端绑定、由提问面板安全展示。 */
export function makeTodoApprovalQuestion(kind, reason = '') {
  if (!Object.hasOwn(APPROVAL_COPY, kind)) throw new TypeError('未知的 Todo 确认类型');
  const copy = APPROVAL_COPY[kind];
  if (typeof reason !== 'string' || reason.length > 600) throw new TypeError('reason 必须是不超过 600 字符的字符串');
  return {
    header: copy.header,
    question: copy.question,
    description: `${copy.description}${reason.trim() ? `\n变更原因：${reason.trim()}` : ''}`,
    options: [{ label: copy.accept }, { label: copy.reject }],
    multiple: false,
  };
}

/** 禁止拿任意一次 question 的同名答案授权；调用方必须核对当前绑定的请求。 */
export function todoApprovalAcceptLabel(kind) {
  if (!Object.hasOwn(APPROVAL_COPY, kind)) throw new TypeError('未知的 Todo 确认类型');
  const copy = APPROVAL_COPY[kind];
  return copy.accept;
}

/**
 * view 由 SQLite 投影构造，必须已按文档预算裁剪“概览和步骤”；不能裁剪当前一级完整要求。
 * 此函数不读取数据库，不决定是否注入，也不在每次请求中调用。
 */
export function buildTodoContextMessage(view, reason) {
  if (!view || typeof view !== 'object' || Array.isArray(view)) throw new TypeError('view 必须是对象');
  if (!['compaction', 'resume', 'reopen', 'fork'].includes(reason)) throw new TypeError('未知恢复原因');
  const text = `${TODO_CONTEXT_PREFIX}\n恢复原因：${reason}\n${JSON.stringify(view)}`;
  if (text.length > 12000) throw new RangeError('任务状态包超过 12000 字符；请减少概览和步骤，不得截断当前一级要求');
  return text;
}

export function buildTodoRuntimeBlockMessage(code, reason) {
  if (typeof code !== 'string' || !code.trim() || typeof reason !== 'string' || !reason.trim()) {
    throw new TypeError('执行阻塞需要明确错误码和原因');
  }
  return `${TODO_RUNTIME_BLOCK_PREFIX}\n错误：${code}\n原因：${reason}\n处理条件满足后，请显式恢复；不要反复重试相同的失败操作。`;
}
