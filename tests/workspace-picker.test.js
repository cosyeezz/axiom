import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import { basename, join, sep } from "node:path";
import { Sessions } from "../src/sessions.js";

// 全局模式（无 sessionId）files.browse：主机目录浏览、过滤、分页、面包屑与快速位置。
test("files.browse global mode lists host directories with filter, pagination and locations", async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-picker-"));
  const factory = () => ({});
  factory.catalog = () => [];
  factory.cwd = root;
  const sessions = new Sessions(factory);
  try {
    await mkdir(join(root, "alpha"));
    await mkdir(join(root, "Beta"));
    await mkdir(join(root, "node_modules"));
    await writeFile(join(root, ".env"), "");
    await Promise.all(Array.from({ length: 205 }, (_, i) =>
      writeFile(join(root, "alpha", `file-${String(i).padStart(3, "0")}.txt`), "x")));
    // 符号链接尽力创建（Windows 无权限时跳过，断言自然成立）。
    await symlink(join(root, ".env"), join(root, "alpha", "link.txt")).catch(() => {});

    // 默认浏览 createAgent.cwd，包含隐藏目录与 node_modules。
    const listing = await sessions.listFiles({});
    assert.equal(listing.path, root.split(sep).join("/"));
    assert.equal(listing.entries.some((entry) => entry.name === ".env"), true);
    assert.equal(listing.entries.some((entry) => entry.name === "node_modules"), true);
    assert.equal(listing.entries.some((entry) => entry.name === "alpha"), true);
    // 目录优先。
    assert.deepEqual(
      listing.entries.map((entry) => entry.directory),
      [...listing.entries].sort((a, b) => Number(b.directory) - Number(a.directory)).map((entry) => entry.directory),
    );

    // 面包屑：从根到当前目录，路径可回放。
    const crumbs = await sessions.listFiles({ path: join(root, "alpha") });
    assert.equal(crumbs.breadcrumbs[0].path, process.platform === "win32" ? crumbs.path.slice(0, 3) : "/");
    assert.deepEqual(crumbs.breadcrumbs.at(-1), { name: "alpha", path: root.split(sep).join("/") + "/alpha" });

    // 上一级导航：parent 指回父目录且能看到当前目录。
    const parent = await sessions.listFiles({ path: crumbs.parent });
    assert.ok(parent.entries.some((entry) => entry.name === "alpha" && entry.directory));

    // directoriesOnly 只返回目录。
    assert.deepEqual((await sessions.listFiles({ directoriesOnly: true })).entries.map((entry) => entry.name),
      ["Beta", "alpha", "node_modules"].sort((a, b) => a.localeCompare(b)));

    // 大小写不敏感过滤。
    assert.deepEqual((await sessions.listFiles({ query: "BETA" })).entries.map((entry) => entry.name), ["Beta"]);

    // 分页：默认每页 200，nextOffset 指向下一页，末页为 null。
    const page1 = await sessions.listFiles({ path: join(root, "alpha") });
    assert.equal(page1.entries.length, 200);
    assert.equal(page1.nextOffset, 200);
    const page2 = await sessions.listFiles({ path: join(root, "alpha"), offset: page1.nextOffset });
    assert.equal(page2.entries.length, 5);
    assert.equal(page2.nextOffset, null);
    // 过滤在分页之前生效。
    const filtered = await sessions.listFiles({ path: join(root, "alpha"), query: "FILE-01", offset: 5 });
    assert.equal(filtered.entries.length, 5);
    assert.equal(filtered.nextOffset, null);

    // 符号链接被跳过。
    assert.equal(page1.entries.some((entry) => entry.name === "link.txt"), false);

    // 快速位置：主目录 + 根（Windows 盘符 / POSIX /）。
    const locations = listing.locations;
    const home = homedir().split(sep).join("/");
    assert.ok(locations.some((location) => location.path === home), "locations 应包含主目录");
    if (process.platform === "win32") {
      assert.ok(locations.some((location) => /^[a-zA-Z]:$/.test(location.name) && location.path.endsWith(":/")));
    } else {
      assert.ok(locations.some((location) => location.path === "/"));
    }

    // 错误清晰。
    await assert.rejects(sessions.listFiles({ path: join(root, "missing") }), /目录不存在/);
    await assert.rejects(sessions.listFiles({ path: join(root, ".env") }), /不是目录/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("revealWorkspace no longer rejects unsupported platforms", { skip: process.platform === "win32" }, async () => {
  const root = await mkdtemp(join(tmpdir(), "axiom-reveal-"));
  const factory = async () => ({ subscribe: () => () => {}, dispose: async () => {}, prompt: async () => {}, abort: async () => {}, result: () => "ok" });
  factory.catalog = () => [];
  try {
    const sessions = new Sessions(factory, undefined, join(root, "storage"));
    const id = await sessions.create(root);
    // 不依赖桌面环境：失败只可能是 xdg-open/open 缺失，不再是非 Windows 平台直接拒绝。
    await sessions.revealWorkspace(id).catch(
      (error) => assert.ok(!/不支持打开资源管理器/.test(error.message), error.message));
  } finally { await rm(root, { recursive: true, force: true }); }
});
