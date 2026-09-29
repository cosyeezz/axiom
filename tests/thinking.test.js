import test from "node:test";
import assert from "node:assert/strict";
import { THINKING_LEVELS, thinkingLevels, resolveThinking, thinkingFavoriteKey } from "../public/thinking.js";
import { createJiti } from "jiti";
const { getSupportedThinkingLevels, clampThinkingLevel } = await createJiti(import.meta.resolve("@earendil-works/pi-coding-agent")).import("@earendil-works/pi-ai");

test("thinking capabilities are canonical, immutable and never guessed", () => {
  const input = ["high", "off", "high", "invalid", "max"];
  assert.deepEqual(thinkingLevels(input), ["off", "high", "max"]);
  assert.deepEqual(input, ["high", "off", "high", "invalid", "max"]);
  assert.deepEqual(thinkingLevels(undefined), []);
  assert.deepEqual(thinkingLevels([]), []);
  assert(Object.isFrozen(THINKING_LEVELS));
});

test("thinking adaptation makes strict, Pi-nearest and legacy compaction policies explicit", () => {
  assert.equal(resolveThinking("medium", ["off", "low"]), "low");
  assert.equal(resolveThinking("medium", ["off", "high"]), "high");
  assert.equal(resolveThinking("max", ["off"]), "off");
  assert.equal(resolveThinking("off", ["low", "high"]), "low");
  assert.equal(resolveThinking("medium", ["off", "low"], { policy: "lowest" }), "off");
  assert.equal(resolveThinking("high", ["low", "high"], { policy: "strict" }), "high");
  assert.throws(() => resolveThinking("medium", ["off", "low"], { policy: "strict" }), /Unsupported/);
  for (const value of [null, undefined, "", "invalid"])
    assert.throws(() => resolveThinking(value, THINKING_LEVELS), /无效/);
  assert.throws(() => resolveThinking("off", []), /没有可用/);
  assert.throws(() => resolveThinking("off", undefined), /没有可用/);
  assert.throws(() => resolveThinking("off", ["off"], { policy: "typo" }), /策略/);
});

test("thinking contract matches installed Pi for every nonempty capability subset and rejects its empty fallback", () => {
  for (let mask = 0; mask < 1 << THINKING_LEVELS.length; mask++) {
    const model = { reasoning: true, thinkingLevelMap: Object.fromEntries(THINKING_LEVELS.map((level, i) => [level, mask & (1 << i) ? level : null])) };
    const levels = getSupportedThinkingLevels(model);
    for (const level of THINKING_LEVELS) {
      if (!levels.length) {
        assert.equal(clampThinkingLevel(model, level), "off");
        for (const policy of ["nearest", "lowest", "strict"]) assert.throws(() => resolveThinking(level, levels, { policy }), /没有可用/);
        continue;
      }
      assert.equal(resolveThinking(level, levels), clampThinkingLevel(model, level), `${mask}:${level}`);
      assert.equal(resolveThinking(level, levels, { policy: "lowest" }), levels.includes(level) ? level : levels[0]);
      if (levels.includes(level)) assert.equal(resolveThinking(level, levels, { policy: "strict" }), level);
      else assert.throws(() => resolveThinking(level, levels, { policy: "strict" }), /Unsupported/);
    }
  }
  assert.deepEqual(getSupportedThinkingLevels({ reasoning: true }), THINKING_LEVELS.slice(0, 5));
  assert.deepEqual(getSupportedThinkingLevels({ reasoning: false, thinkingLevelMap: { off: null, max: "max" } }), ["off"]);
  assert.deepEqual(getSupportedThinkingLevels({ reasoning: true, thinkingLevelMap: { off: null, xhigh: 0, max: "" } }), THINKING_LEVELS.slice(1));
});

test("thinking favorite keys keep model identity and exclude inherit/unknown values", () => {
  assert.equal(thinkingFavoriteKey("provider/model:version", "max"), "provider/model:version:max");
  assert.equal(thinkingFavoriteKey(null, "high"), null);
  assert.equal(thinkingFavoriteKey("provider/model", ""), null);
  assert.equal(thinkingFavoriteKey("provider/model", "invalid"), null);
});
