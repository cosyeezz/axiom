import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createThinkingPicker, thinkingSelection } from "../public/thinking-picker.js";
import { THINKING_LEVELS } from "../public/thinking.js";

const values = select => [...select.options].map(option => option.value);

test("thinking selector handles sparse levels, inherited values, unavailable capabilities and manual repair", () => {
  assert.deepEqual(thinkingSelection({ levels: ["off", "high", "max"], value: "medium" }).entries, [["off", "off"], ["high", "high"], ["max", "max"]]);
  const view = thinkingSelection({ levels: ["low", "high"], value: "off" });
  assert.equal(view.effective, "low");
  assert.equal(view.requested, "off");
  assert.equal(view.adapted, true);
  assert.match(view.description, /off.*low/);
  assert.equal(thinkingSelection({ levels: ["off"], value: null, inherit: "跟随" }).effective, "");
  assert.equal(thinkingSelection({ levels: ["off"], value: "off", inherit: "跟随" }).effective, "off");
  assert.equal(thinkingSelection({ value: "high" }).unavailable, true);
  assert.deepEqual(thinkingSelection({ manual: true, value: "medium" }).entries.map(([level]) => level), THINKING_LEVELS);
  assert.match(thinkingSelection({ manual: true }).description, /尚未验证/);
});

test("deferred defaults save intent without claiming model capabilities and adapt only after model selection", () => {
  const dom = new JSDOM('<form><select id="thinking"></select></form>');
  const select = dom.window.document.getElementById("thinking");
  const picker = createThinkingPicker();
  try {
    for (const value of ["high", "off", null]) {
      picker.sync(select, { deferred: true, inherit: "沿用默认", value, model: "" });
      assert.equal(picker.requested(select), value);
      assert.equal(select.checkValidity(), true);
      assert.equal(select.dataset.thinkingModel, "");
      assert.match(select.title, /不表示模型支持全部/);
    }
    picker.sync(select, { value: "max" });
    picker.sync(select, { deferred: false, model: "p/a", levels: ["low", "high"] });
    assert.equal(select.value, "high");
    assert.equal(picker.requested(select), "max");
    picker.sync(select, { levels: [] });
    assert.equal(select.form.checkValidity(), false, "known unusable model still blocks configuration form");
  } finally { dom.window.close(); }
});

test("thinking select shares one lifecycle and retains preference across model capabilities without emitting saves", () => {
  const dom = new JSDOM('<select id="thinking"></select>');
  const select = dom.window.document.getElementById("thinking");
  let model = "p/a", levels = ["off", "high", "max"], changes = 0, enhanced = 0, disposed = 0;
  const picker = createThinkingPicker({ picker: { enhance: () => enhanced++, sync() {}, dispose: () => disposed++ } });
  try {
    select.addEventListener("change", () => changes++);
    picker.sync(select, { value: "max", context: () => ({ model, levels }) });
    assert.equal(select.value, "max");
    model = "p/b"; levels = ["low", "high"];
    picker.sync(select);
    assert.deepEqual(values(select), ["low", "high"]);
    assert.equal(select.value, "high");
    assert.equal(picker.requested(select), "max");
    assert.equal(select.dataset.thinkingModel, "p/b");
    assert.match(select.title, /max.*high/);
    assert.equal(changes, 0);
    levels = ["off", "high", "max"]; picker.refreshAll();
    assert.equal(select.value, "max", "original intent is restored when supported again");
    select.value = "off";
    select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    assert.equal(picker.requested(select), "off");
    assert.equal(changes, 1);
    assert.equal(enhanced, 1);
    picker.dispose(select); picker.dispose(select);
    assert.equal(disposed, 1);
    select.value = "high"; select.dispatchEvent(new dom.window.Event("change"));
    assert.equal(select.dataset.thinkingRequested, "off", "disposed listener is removed");
  } finally { dom.window.close(); }
});

test("thinking select never revives unsupported options, supports explicit reset to inherit, and cleans disconnected controls", () => {
  const dom = new JSDOM('<select id="thinking"></select>');
  const select = dom.window.document.getElementById("thinking");
  let levels = ["low", "high"], disposed = 0;
  const picker = createThinkingPicker({ picker: { enhance() {}, sync() {}, dispose: () => disposed++ } });
  try {
    picker.sync(select, { value: "off", policy: "lowest", context: () => ({ levels }) });
    assert.deepEqual(values(select), ["low", "high"]);
    assert.equal(select.value, "low");
    levels = []; picker.refreshAll();
    assert.equal(select.checkValidity(), false);
    assert.equal(select.options[0].disabled, true);
    assert.equal(select.querySelector('[value="off"]'), null);
    levels = ["high"];
    picker.sync(select, { inherit: "跟随", value: null });
    assert.equal(select.value, "");
    assert.equal(picker.requested(select), null);
    assert.equal(select.checkValidity(), true);
    picker.sync(select, { value: "high" });
    select.value = ""; select.dispatchEvent(new dom.window.Event("change"));
    picker.refreshAll(); assert.equal(select.value, "", "inherit cannot resurrect an initial explicit level");
    select.remove(); picker.refreshAll(); assert.equal(disposed, 1);
  } finally { dom.window.close(); }
});
