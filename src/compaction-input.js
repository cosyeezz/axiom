import { contentHash } from './raw-history.js';

/** Bounded view only; never used to serialize the raw archive. Ranges are UTF-8 bytes. */
export function selectSummaryInput(evidence, maxBytes) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 256) throw Object.assign(new Error('No summary input budget'), { code: 'WINDOW_UNSAFE' });
  evidence = evidence.map(({ userText, ...item }) => item);
  const overhead = Buffer.byteLength(JSON.stringify(evidence.map(item => ({ ...item, text: '' }))));
  const available = maxBytes - overhead;
  if (available < evidence.length * 64) throw Object.assign(new Error('Too many messages for safe summary selection'), { code: 'WINDOW_UNSAFE' });
  const weights = evidence.map(item => item.role === 'user' ? 3 : 1), total = weights.reduce((a, b) => a + b, 0);
  return evidence.map((item, index) => {
    const bytes = Buffer.from(item.text), allocation = Math.floor(available * weights[index] / total);
    if (bytes.length <= allocation) return { ...item, sourceHash: contentHash(item.text), includedRanges: [[0, bytes.length]], omittedRanges: [], selectionReason: 'complete' };
    let head = Math.floor(allocation / 2), tail = bytes.length - Math.floor(allocation / 2);
    while (head > 0 && (bytes[head] & 0xc0) === 0x80) head--;
    while (tail < bytes.length && (bytes[tail] & 0xc0) === 0x80) tail++;
    return { ...item, text: bytes.subarray(0, head).toString('utf8') + '\n[omitted: not reviewed; use history_read]\n' + bytes.subarray(tail).toString('utf8'), sourceHash: contentHash(item.text), includedRanges: [[0, head], [tail, bytes.length]], omittedRanges: [[head, tail]], selectionReason: 'bounded head/tail; user sources weighted; omitted content not semantically reviewed' };
  });
}
