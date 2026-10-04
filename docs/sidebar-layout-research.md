# 侧栏布局：研究、决策与验收

日期：2026-10-03。范围：Axiom 工作空间／会话导航，不重做全站，不改变会话执行、数据或完成标记语义。

## 方法与证据边界

并行完成现状审计、产品研究、导航／可访问性研究，再进行独立只读代码审查。以下六个产品均有官方公开正文、URL 和短摘录；主代理定向复核正文。没有登录、测量或运行这些产品，不把文档能力描述当作所有客户端的当前布局。最初 ChatGPT 研究仅返回“已交付”摘要，没有可见引文，**不纳入证据和六产品计数**。Notion 文档同时有新旧 Home 入口描述；Claude 有分阶段 Projects beta；不将其推广到所有账户。

## 六产品比较

| 产品 | 官方事实与短摘录 | 对 Axiom 的启发（设计判断） | 不照搬／未核实 |
| --- | --- | --- | --- |
| Linear | [Personalized sidebar, 2024-12-18](https://linear.app/changelog/2024-12-18-personalized-sidebar)：可重排、隐藏低频项；“hide items you don’t need frequently behind a More menu.” [Favorites](https://linear.app/docs/favorites)：“Favorites are personal shortcuts which appear in your sidebar.” | 新建／搜索稳定可见，低频设置收紧；收藏和最近活动不混为一谈。 | 不新增任意层级收藏文件夹、拖拽或团队管理。滚动容器细节未核实。 |
| Notion | [Navigate with the sidebar](https://www.notion.com/help/navigate-with-the-sidebar)：“Show allows you to determine the number of items each section shows.”；“Access previous chats with Notion AI, sorted by recency.” 完整浏览可走 Library。 | 侧栏不必常驻全部元信息；保留清楚的分组、搜索和完整历史路径。 | 本次不引入条数截断／新历史页，避免隐藏后台任务；不复制页面树和共享权限语义。 |
| Slack | [Adjust sidebar preferences](https://slack.com/help/articles/212596808-Adjust-your-sidebar-preferences)：“The navigation bar holds tabs used to navigate Slack, like Home, Activity, and Later.” Home 内容侧栏列频道和 DM。 [Custom sections](https://slack.com/help/articles/360043207674-Organize-your-sidebar-with-custom-sections)：“Each section can have its own filters and sorting.” | 稳定操作与动态会话分区；折叠／筛选必须有明确找回路径。 | 不复制30天活跃过滤；AI闲置会话可能仍有重要上下文。官方 Ctrl/⌘+. 关闭的是右侧栏，不能当作左侧栏行为。 |
| VS Code | [Custom Layout](https://code.visualstudio.com/docs/configure/custom-layout#_secondary-side-bar)：“VS Code will remember the layout of views and panels across your sessions.” 可在主／副侧栏移动视图，并 Reset View Locations。 | 收起、展开和浏览偏好应可逆，不为省空间丢失导航入口。 | 不引入第二侧栏、拖拽布局编辑器；本次没有核实 AI 历史入口。 |
| Cursor | [Conversation search](https://cursor.com/help/ai-features/conversation-search.md)：Agents Window 内 Cmd/Ctrl+K 检索；“Search across your past agent transcripts”；“Cursor builds a local search index that scales to thousands of conversations.” | 找回历史不只靠滚动；折叠时仍给搜索入口并保留现有快捷键。 | Axiom仍只搜标题，不冒充正文索引。旧 docs.cursor.com 历史页不存在，不作为证据。 |
| Claude | [What are projects?](https://support.claude.com/en/articles/9517075-what-are-projects)：“Projects allow you to create self-contained workspaces with their own chat histories and knowledge bases.” | 项目是上下文边界；跨项目检索仍应辨认会话归属。 | 不新增知识库；当前版事实与新 Projects beta 分开。未核实其侧栏精确尺寸和窄屏行为。 |

共同结论：借鉴的是**工作空间上下文、稳定主操作、动态列表、渐进披露、可逆检索**，不是复制某个客户端。没有来源证明“侧栏必须256px”“固定头尾＋单滚动是六产品共同实现”或某个行高／断点是行业规范。

补充一手资料：[Linear 工作空间](https://linear.app/docs/workspaces)、[Linear 搜索](https://linear.app/docs/search)、[Notion 搜索](https://www.notion.com/help/search)、[Slack 快捷键](https://slack.com/help/articles/201374536-Slack-keyboard-shortcuts)。

## 规范、指导和建议分开

- **WCAG 2.2规范**：[2.1.1 Keyboard](https://www.w3.org/TR/WCAG22/#keyboard)、[2.4.1 Bypass Blocks](https://www.w3.org/TR/WCAG22/#bypass-blocks)、[2.4.7 Focus Visible](https://www.w3.org/TR/WCAG22/#focus-visible)、[2.4.11 Focus Not Obscured](https://www.w3.org/TR/WCAG22/#focus-not-obscured-minimum)。AA要求焦点不被作者内容完全遮住，不等于AAA完全无遮挡要求。
- [2.5.8 Target Size Minimum](https://www.w3.org/TR/WCAG22/#target-size-minimum) 为24×24 CSS px，含间距等例外；44×44为增强目标／本项目触屏工程目标，不能说是AA一律要求。[1.4.10 Reflow](https://www.w3.org/TR/WCAG22/#reflow) 要求320 CSS px等效宽度下不因重排丢信息或功能（有适用例外）。
- **APG实施指导**：[Disclosure Navigation](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-navigation/)：“Typical site navigation does not need all the keyboard interactions specified by the menu and menubar pattern.” [Listbox](https://www.w3.org/WAI/ARIA/apg/patterns/listbox/) 不适合含按钮／链接等交互子项的行。保留具名nav、原生button/details与普通Tab，不将侧栏伪装成menu/tree/listbox。
- **经验建议**：[NN/g Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/)：“You have to disclose everything that users frequently need up front”；二级入口必须明显。 [Fluent Nav](https://fluent2.microsoft.design/components/web/react/core/nav/usage)：“In most cases, stick with only one secondary action.”；底栏可能遮住内容，建议检查400%缩放可用空间。
- [Carbon 左栏样式](https://carbondesignsystem.com/components/UI-shell-left-panel/style/) 的256px宽、32px链接高和Fluent的260px／640px断点都是品牌组件策略，不是通用规范。[NN/g Infinite Scrolling](https://www.nngroup.com/articles/infinite-scrolling-tips/)提示找回特定对象的定位成本，不能据此直接推断必须虚拟化。

## 现状与方案

原结构的主要问题：折叠56px轨道保留设置等辅助项却隐藏新建／搜索；“进行中”含闲置未标完成会话；重复路径、组头、日期分隔占高；已完成内层滚动套在历史滚动区中；底栏纵向三行挤占列表。

选择“优化层级，不重做功能”，而不是更换主题或加导航栏：

```text
品牌／收起
新会话（唯一主色操作）
标题搜索
工作空间          打开／导入
  项目名称         配置／新建
  同名时显示路径
  置顶／未完成／已完成（计数＋展开指示）
  会话历史（一个滚动区，搜索不显示日期分隔）
连接状态                 更多／设置
```

1. 折叠轨道保留新建和搜索；搜索展开并聚焦。增加键盘“跳到对话”，手机先释放背景inert。
2. 工作空间操作移至历史标题行；普通工作空间只显示名称，同名时显示路径，搜索过滤不能改变全量同名判断。完整路径保留悬停、无障碍名称及原有配置入口。
3. “进行中”改“未完成”，只改文案，不迁移localStorage key、不改变运行／待确认／待查看／置顶／完成分组逻辑。运行状态仍用独立状态点。
4. 正常高度历史整体滚动；移除已完成45vh嵌套滚动。≤500px高时整个侧栏滚动，仅搜索框sticky，以保留检索与退出后的原位置；在原生编辑前记录浏览位置，避免sticky输入框光标自动滚动造成偏移，焦点滚动留64px上边距。
5. 桌面底栏横排，连接文案保留；手机真实控件仍迁入原更多弹窗，窄屏抽屉与56px轨道不变。粗指针工作空间按钮44×44，桌面24×24；不是一味压小文字。
6. 复用Linear主题token：近黑canvas、surface/raised、ink/muted/line和薰衣草蓝accent（#5e6ad2），4/8/12px节奏；保留既有深浅主题、系统字体及统一SVG。不增加依赖、装饰阴影或新配色。

未采用：无限树、第二侧栏、正文搜索、新的全量历史页、任意收藏文件夹、自动归档、虚拟化。先保证现有功能及500条可操作；本次未做性能SLA测量，不能声称可无限扩展。

## 审查与验证

独立只读审查发现并补修：工作空间“＋”状态刷新遗漏；低高度滚动容器变化后搜索位置恢复；搜索筛掉同名目录后路径消歧丢失。专项测试覆盖初连／切换／断线、同名目录搜索以及两种滚动容器恢复。低高度复测发现原生编辑在beforeinput与input之间为sticky搜索框自动滚动光标，导致原位置提前偏移；事件日志确认后改为beforeinput捕获，增加针对性回归。

可复现命令：

```bash
node --test tests/sidebar-controls.test.js tests/app.test.js tests/focus-ui.test.js tests/workspace-tabs.test.js tests/new-session-feedback.test.js tests/tooltip.test.js
python tests/sidebar-layout-ui.py ../sidebar-layout-evidence/final-layout
python tests/focus-ui-browser.py ../sidebar-layout-evidence/final-focus
python tests/session-waiting-ui.py ../sidebar-layout-evidence/final-waiting
```

`sidebar-layout-ui.py`自行启动／清理随机端口mock预览，不调用模型或用户数据；先执行现有会话与搜索回归，再测试1440×1000、768×900、320×640、390×844、667×375、320×256，深浅双主题；0/1/50/500会话、同名目录、触控44px、长列表End焦点、折叠入口、跳过导航、底栏可达及无页面横向溢出。320×256仅等效几何，不冒充真实400%浏览器缩放、读屏或真机测试。

最终集成测试、版本和证据位置见本次 `devlog.md`。未完成NVDA/VoiceOver、实体触屏/IME、Firefox/WebKit和桌面壳原生验收；不宣称整站WCAG合规或效率指标已有用户实测。
