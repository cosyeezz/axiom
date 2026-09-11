import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { homedir } from "node:os";
import { supervise } from "./service.mjs";

// 显式开发入口：不让旧 .env.local 把工作空间指回另一份源码。
process.env.AXIOM_DEV = "1";
process.env.AXIOM_PORT ||= "4320";
process.env.AXIOM_CWD ||= fileURLToPath(new URL("..", import.meta.url));
process.env.AXIOM_HOME ||= join(homedir(), ".axiom-dev");
await supervise();
