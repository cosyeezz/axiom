import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { observationPackExtension, createObservation, previewObservationMessages } from '../src/observation-pack.js';

test('pure OP preview does not archive or change projection counters', async () => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-preview-'));
  try {
    const messages = [{ role: 'toolResult', toolName: 'bash', toolCallId: 't1', content: [{ type: 'text', text: 'x'.repeat(9000) }] }, { role: 'assistant', content: [] }, { role: 'assistant', content: [] }];
    const first = previewObservationMessages(messages, root);
    assert.deepEqual(first, previewObservationMessages(messages, root));
    assert.notEqual(first[0].content[0].text, messages[0].content[0].text);
    assert.deepEqual(await readdir(root), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('projection cache reuses archive without rewriting and invalidates same-length source or disk mutations', async () => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-op-cache-'));
  try {
    const handlers = new Map();
    observationPackExtension(root)({ on: (name, handler) => handlers.set(name, handler), registerTool() {} });
    const message = { role: 'toolResult', toolName: 'bash', toolCallId: 't1', content: [{ type: 'text', text: 'x'.repeat(9000) }] };
    const messages = [message, { role: 'assistant', content: [] }, { role: 'assistant', content: [] }];
    const project = () => handlers.get('context')({ messages });
    await project();
    const observation = createObservation(message, root);
    const before = await stat(observation.manifestFile);
    await project();
    assert.equal((await stat(observation.manifestFile)).mtimeMs, before.mtimeMs);
    await writeFile(observation.filePath, 'z'.repeat(9000));
    assert.equal((await project()).messages[0], message, 'tampered archive fails open to original');
    message.content[0].text = 'y'.repeat(9000);
    const changed = await project();
    assert.ok(changed.messages[0].content[0].text.includes(createObservation(message, root).id));
    assert.notEqual(createObservation(message, root).id, observation.id);
  } finally { await rm(root, { recursive: true, force: true }); }
});
