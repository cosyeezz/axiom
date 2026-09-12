import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { main as autostart } from "./autostart.mjs";

// 保留会话和共享 Pi；从用户目录执行 npm，避免 Windows 删除当前工作目录失败。
export async function uninstall({ execute, stop, npm, disable = () => autostart(["disable"]), root = fileURLToPath(new URL("..", import.meta.url)), cwd = homedir() } = {}) {
  const globalRoot = (await npm(execute, ["root", "-g"], cwd, true)).trim();
  const target = join(globalRoot, "@cosyeezz", "axiom");
  if (!globalRoot || realpathSync(target) !== realpathSync(root))
    throw new Error("当前运行目录不是此 npm 的全局 Axiom 安装，拒绝卸载其他实例。");
  await stop(); // 忙碌/超时必须阻止卸载，不删除正在运行的代码。
  await disable();
  await npm(execute, ["uninstall", "-g", "@cosyeezz/axiom"], cwd);
  console.log("Axiom 已卸载；会话数据和 Pi 配置均保留。");
}
