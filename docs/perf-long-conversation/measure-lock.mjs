import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

export function acquireMeasureLock(output, directory = path.join(os.tmpdir(), "axiom-perf-measure.lock")) {
  const token = randomUUID();
  try { fs.mkdirSync(directory); }
  catch (error) {
    if (error.code !== "EEXIST") throw error;
    throw new Error(`Measurement lock exists: ${directory}. Verify the owner and its processes before manual removal.`);
  }
  const owner = path.join(directory, "owner.json");
  // If writing ownership fails, leave the directory locked rather than guessing ownership.
  fs.writeFileSync(owner, JSON.stringify({ token, pid: process.pid, host: os.hostname(), startedAt: new Date().toISOString(), output }), { flag: "wx" });
  return () => {
    if (JSON.parse(fs.readFileSync(owner, "utf8")).token !== token)
      throw new Error(`Measurement lock ownership changed: ${directory}`);
    fs.unlinkSync(owner);
    fs.rmdirSync(directory);
  };
}
