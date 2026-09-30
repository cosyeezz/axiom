import { MAIN_AGENT_PROMPT, SUBAGENT_PROMPT } from "./prompts.js";
import { isMemoryProfile, MEMORY_QUERY_PROMPT, MEMORY_MAINTAIN_PROMPT } from './agent-profile.js';
import { realpath } from "node:fs/promises";
import { inlineImagesExtension } from "./inline-images.js";
import { basename, dirname, join, resolve, relative, isAbsolute, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import {
  DefaultPackageManager, DefaultResourceLoader, getAgentDir,
  loadSkills, SettingsManager,
} from "@earendil-works/pi-coding-agent";

// Use the host SDK for TypeScript packages installed in Pi's separate npm directory.
const sdkEntry = import.meta.resolve("@earendil-works/pi-coding-agent");
const resolver = createJiti(sdkEntry);
const alias = {};
for (const subpath of ["compat", "oauth", "providers/all"])
  for (const scope of ["@earendil-works", "@mariozechner"])
    alias[`${scope}/pi-ai/${subpath}`] = fileURLToPath(resolver.esmResolve(`@earendil-works/pi-ai/${subpath}`));
for (const name of ["pi-coding-agent", "pi-agent-core", "pi-tui", "pi-ai"])
  for (const scope of ["@earendil-works", "@mariozechner"])
    alias[`${scope}/${name}`] = fileURLToPath(resolver.esmResolve(`@earendil-works/${name}${name === "pi-ai" ? "/compat" : ""}`));
for (const subpath of ['', '/compile', '/value'])
  for (const name of ['typebox', '@sinclair/typebox'])
    alias[`${name}${subpath}`] = fileURLToPath(resolver.esmResolve(`typebox${subpath}`));
const jiti = createJiti(import.meta.url, { alias, moduleCache: false });

// 主代理不装配的导航类技能：探索/导航一律交给子代理（MAIN_AGENT_PROMPT 的 Delegation 段）。
// 主代理的 loader 不装载它们，系统提示里就没有可用技能入口，模型无法借技能亲自调研；
// 子代理（无 customTools）装配全部选中技能。选择集本身不变：子代理 inherit 主代理选择集
// 时仍含这些技能，能力配置的持久化与恢复语义不受影响。
export const MAIN_EXCLUDED_SKILLS = ["codebase-map"];

export function snapshotSettings(cwd, agentDir, projectTrusted) {
  const disk = SettingsManager.create(cwd, agentDir, { projectTrusted });
  const errors = disk.drainErrors();
  if (errors.length) throw new Error(`Pi 配置读取失败：${errors.map((e) => e.error?.message || e.message || e).join("; ")}`);
  const data = { global: JSON.stringify(disk.getGlobalSettings()), project: JSON.stringify(disk.getProjectSettings()) };
  return SettingsManager.fromStorage({
    withLock(scope, update) {
      const next = update(data[scope]);
      if (next !== undefined) data[scope] = next;
    },
  }, { projectTrusted });
}

export async function discoverCapabilities(cwd, { agentDir = getAgentDir(), loadAdapter = true } = {}) {
  // 与保存配置/创建会话使用同一真实目录，避免符号链接产生两套技能 ID。
  cwd = await realpath(resolve(cwd));
  // Axiom 以选择工作空间作为信任确认，不依赖或修改本机 Pi 的信任设置。
  const projectTrusted = true;
  const needsTrust = false;
  const settingsManager = snapshotSettings(cwd, agentDir, projectTrusted);
  const paths = await new DefaultPackageManager({ cwd, agentDir, settingsManager }).resolve(async () => "error");
  const enabled = (kind) => paths[kind].filter((r) => r.enabled);
  const skills = loadSkills({ cwd, agentDir, includeDefaults: false, skillPaths: enabled("skills").map((r) => r.path) });
  const plugins = enabled("extensions");
  const adapter = plugins.find((r) => /[/\\]pi-mcp-adapter[/\\]/.test(r.path));
  let mcpConfig = { mcpServers: {} }, createMcpAdapter;
  let mcpProvenance = new Map();
  if (adapter) {
    const root = dirname(adapter.path);
    const configModule = await jiti.import(join(root, "config.ts"));
    // An untrusted project must not activate project MCP commands or imports.
    mcpConfig = configModule.loadMcpConfig(undefined, projectTrusted ? cwd : join(agentDir, "axiom-no-project"));
    mcpProvenance = configModule.getServerProvenance?.(undefined, cwd) ?? new Map();
    if (loadAdapter) ({ createMcpAdapter } = await jiti.import(adapter.path));
  }
  const catalog = {
    cwd, projectTrusted, needsTrust,
    skills: skills.skills.map((s) => {
      const source = enabled("skills").find((entry) => {
        const path = relative(entry.path, s.filePath);
        return path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
      });
      return { id: s.filePath, name: s.name, description: s.description,
        scope: source?.metadata.scope === "project" ? "project" : "global" };
    }),
    plugins: plugins.filter((r) => r !== adapter).map((r) => ({
      id: r.path,
      scope: r.metadata.scope === "project" ? "project" : "global",
      name: r.metadata.origin === "package" ? `${r.metadata.source} · ${basename(r.path)}` : basename(r.path),
    })),
    mcp: Object.entries(mcpConfig.mcpServers).filter(([, server]) => server.disabled !== true)
      .map(([name]) => ({ id: name, name,
        // 来源不明（旧适配器、项目导入或插件贡献）保守归当前项目，不向全局兜底泄漏。
        scope: mcpProvenance.get(name)?.kind === "user" ? "global" : "project",
      })),
    warnings: skills.diagnostics.map((d) => d.message),
  };
  return { catalog, settingsManager, paths, adapter, mcpConfig, createMcpAdapter, agentDir, cwd };
}

export function resolveCapabilities(selection, catalog, { allowUnavailable = false, warnings = [] } = {}) {
  const result = {};
  for (const kind of ["skills", "plugins", "mcp"]) {
    const available = catalog[kind].map((r) => r.id);
    const selected = selection == null ? available : selection[kind];
    if (!Array.isArray(selected)) throw new Error(`无效的能力选择：${kind}`);
    const missing = selected.filter((id) => !available.includes(id));
    if (missing.length) {
      const message = `未知或已不可用的能力：${kind}：${missing.join("、")}`;
      if (!allowUnavailable) throw new Error(message);
      warnings.push(`已跳过${message}`);
    }
    result[kind] = [...new Set(selected.filter((id) => available.includes(id)))];
  }
  return result;
}

export function refreshProjectSkills(loader, selected, catalog, all = false, excludeNames = []) {
  // 项目技能可由 composer 手动调用，不受旧会话的全局技能快照限制；excludeNames 为主代理排除的
  // 导航技能：不随刷新注入 loader（选择集语义不变，见 MAIN_EXCLUDED_SKILLS）。
  const available = catalog.skills.filter((skill) => (all || skill.scope === "project" || selected.skills.includes(skill.id)) && !excludeNames.includes(skill.name));
  selected.skills = [...new Set([...selected.skills, ...available.map((skill) => skill.id)])];
  loader.extendResources({
    skillPaths: available.map((skill) => ({ path: skill.id, metadata: { source: skill.scope, scope: skill.scope, origin: "top-level" } })),
  });
  return loader.getSkills().skills.map(({ name, description }) => ({ name, description }));
}

export function capabilityLoader(resources, selection, customTools, extraFactories = [], budgetPrompt = null, profile = { role: 'main' }, dynamicTools, eventBus) {
  const { catalog, settingsManager, paths, adapter, mcpConfig, createMcpAdapter, cwd, agentDir } = resources;
  const isolated = isMemoryProfile(profile);
  const selected = isolated ? { skills: [], plugins: [], mcp: [] } : resolveCapabilities(selection, catalog);
  // 角色显式指定；自定义工具的数量不改变提示词或技能权限。
  // skillsOverride 闭包必须实时计算：refreshProjectSkills 会扩充 selected.skills，
  // 快照会把运行中新选入的技能一并滤掉；排除集合（按技能名）在 catalog 快照内固定。
  const excludedSkillIds = new Set(catalog.skills.filter((skill) => MAIN_EXCLUDED_SKILLS.includes(skill.name)).map((skill) => skill.id));
  const loaderSkills = () => (profile.role === 'main'
    ? selected.skills.filter((id) => !excludedSkillIds.has(id))
    : selected.skills);
  const factories = [...extraFactories, ...(!isolated ? [{ name: "axiom-inline-images", factory: inlineImagesExtension }] : [])];
  if (dynamicTools) for (const path of selected.plugins) factories.push({ name: path, factory: async pi => {
    // Use the same host-SDK aliases as external packages. Wrapping the factory
    // captures both startup and later registerTool calls without private SDK hooks.
    const module = await jiti.import(path);
    if (typeof module.default !== 'function') throw new Error(`Invalid extension factory: ${path}`);
    await module.default(dynamicTools.facade(pi, path));
  } });
  if (!isolated && adapter && (selection == null || selected.mcp.length)) {
    const factory = createMcpAdapter({ config: {
      ...mcpConfig,
      // Operations are discovered through proxy metadata, not direct schemas.
      settings: { ...mcpConfig.settings, disableProxyTool: false, scriptMode: false, directTools: false, freezeDirectTools: false },
      mcpServers: Object.fromEntries(selected.mcp.map((id) => {
        const server = mcpConfig.mcpServers[id];
        return [id, server.command && !server.cwd ? { ...server, cwd } : server];
      })),
    } });
    factories.push({ name: 'axiom-mcp', factory: pi => factory(dynamicTools ? dynamicTools.facade(pi, 'axiom-mcp', { adapter: true }) : pi) });
  }
  return {
    selected,
    loader: new DefaultResourceLoader({
      cwd, agentDir, settingsManager, ...(eventBus ? { eventBus } : {}),
      noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true,
      additionalExtensionPaths: dynamicTools ? [] : selected.plugins,
      additionalSkillPaths: loaderSkills(),
      additionalPromptTemplatePaths: isolated ? [] : paths.prompts.filter((r) => r.enabled).map((r) => r.path),
      additionalThemePaths: isolated ? [] : paths.themes.filter((r) => r.enabled).map((r) => r.path),
      ...(isolated ? { agentsFilesOverride: () => ({ agentsFiles: [] }), systemPromptOverride: () => profile.purpose === 'memory-query' ? MEMORY_QUERY_PROMPT : MEMORY_MAINTAIN_PROMPT } : {}),
      extensionFactories: factories,
      // Preserve the custom allowlist even when an extension contributes more skills on startup.
      skillsOverride: (current) => ({ ...current, skills: isolated ? [] : current.skills.filter((s) => selection == null || loaderSkills().includes(s.filePath)) }),
      appendSystemPromptOverride: (current) => [...(isolated ? [] : current),
        // 子代理轮次预算的开工告知，原文固定，来自 task-budget；
        // 动态 [轮次预算] 收尾提示由代码按累计 turn 注入，不让模型计数。
        ...(budgetPrompt ? [budgetPrompt] : []),
        ...(!isolated ? [profile.role === 'main' ? MAIN_AGENT_PROMPT : SUBAGENT_PROMPT, ...(profile.systemPrompt ? [profile.systemPrompt] : [])] : [])],
    }),
  };
}
