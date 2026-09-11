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
const jiti = createJiti(import.meta.url, { alias });

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
  if (adapter) {
    const root = dirname(adapter.path);
    const configModule = await jiti.import(join(root, "config.ts"));
    // An untrusted project must not activate project MCP commands or imports.
    mcpConfig = configModule.loadMcpConfig(undefined, projectTrusted ? cwd : join(agentDir, "axiom-no-project"));
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
      name: r.metadata.origin === "package" ? `${r.metadata.source} · ${basename(r.path)}` : basename(r.path),
    })),
    mcp: Object.entries(mcpConfig.mcpServers).filter(([, server]) => server.disabled !== true)
      .map(([name]) => ({ id: name, name })),
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

export function capabilityLoader(resources, selection, customTools) {
  const { catalog, settingsManager, paths, adapter, mcpConfig, createMcpAdapter, cwd, agentDir } = resources;
  const selected = resolveCapabilities(selection, catalog);
  const factories = [{ name: "axiom-inline-images", factory: inlineImagesExtension }];
  if (adapter && (selection == null || selected.mcp.length)) {
    factories.push({ name: "axiom-mcp", factory: createMcpAdapter({ config: {
      ...mcpConfig,
      mcpServers: Object.fromEntries(selected.mcp.map((id) => {
        const server = mcpConfig.mcpServers[id];
        return [id, server.command && !server.cwd ? { ...server, cwd } : server];
      })),
    } }) });
  }
  return {
    selected,
    loader: new DefaultResourceLoader({
      cwd, agentDir, settingsManager,
      noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true,
      additionalExtensionPaths: selected.plugins,
      additionalSkillPaths: selected.skills,
      additionalPromptTemplatePaths: paths.prompts.filter((r) => r.enabled).map((r) => r.path),
      additionalThemePaths: paths.themes.filter((r) => r.enabled).map((r) => r.path),
      extensionFactories: factories,
      // Preserve the custom allowlist even when an extension contributes more skills on startup.
      skillsOverride: (current) => ({ ...current, skills: current.skills.filter((s) => selection == null || selected.skills.includes(s.filePath)) }),
      appendSystemPromptOverride: (current) => [...current, customTools.length
        ? "Delegate independent work with delegate. Wait for the proactive completion notification that reports each finished task's taskId and resultId, then read that result once with read_result; do not poll. Use append to add instructions to a running subtask. Avoid concurrent edits to the same files. Report task failures honestly."
        : "Complete the delegated task. Return concise findings and changes with evidence."],
    }),
  };
}
