import test from "node:test";
import assert from "node:assert/strict";
import { queueStateOf, withdrawQueue } from "../src/pi.js";

const custom = (text) => ({ role: "custom", customType: "task-notification", content: text });
const user = (text) => ({ role: "user", content: [{ type: "text", text }, { type: "image", data: "img", mimeType: "image/png" }] });

for (const internalOnly of [false, true]) {
  test(`withdraw preserves internal notifications in both queues (internalOnly=${internalOnly})`, () => {
    const first = custom("first");
    const second = custom("second");
    const follow = custom("follow");
    const agent = {
      steeringQueue: { messages: [first, ...(internalOnly ? [] : [user("steer")]), second] },
      followUpQueue: { messages: [...(internalOnly ? [] : [user("later")]), follow] },
      steer(message) { this.steeringQueue.messages.push(message); },
      followUp(message) { this.followUpQueue.messages.push(message); },
    };
    const before = queueStateOf(agent.steeringQueue, agent.followUpQueue);
    assert.deepEqual(before.internal.steering, internalOnly ? [true, true] : [true, false, true]);
    assert.equal(before.steering.length, internalOnly ? 2 : 3, "internal notifications still block idle/checkpoint gates");
    let clears = 0;
    const session = { agent, clearQueue() {
      clears++;
      agent.steeringQueue.messages = [];
      agent.followUpQueue.messages = [];
    } };
    const withdrawn = withdrawQueue(session);
    assert.equal(clears, 1);
    assert.deepEqual(withdrawn.steering, internalOnly ? [] : ["steer"]);
    assert.deepEqual(withdrawn.followUp, internalOnly ? [] : ["later"]);
    assert.equal(withdrawn.internal, undefined);
    if (!internalOnly) assert.equal(withdrawn.images.steering[0][0].data, "img");
    assert.deepEqual(agent.steeringQueue.messages, [first, second]);
    assert.equal(agent.steeringQueue.messages[0], first, "restore the exact message, without delivery or history writes");
    assert.deepEqual(agent.followUpQueue.messages, [follow]);
    assert.deepEqual(withdrawQueue(session).steering, [], "repeated Esc cannot withdraw a notification");
    assert.deepEqual(agent.steeringQueue.messages, [first, second]);
  });
}
