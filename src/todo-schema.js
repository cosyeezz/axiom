import { z } from 'zod';

// Shared basic contracts. Runtime keeps strict per-operation objects and trimming;
// the public tool schema deliberately keeps a wide operation object for compatibility.
const string = (maxLength, { minLength, trim = false } = {}) => {
 let runtime = z.string();
 if (trim) runtime = runtime.trim();
 if (minLength !== undefined) runtime = runtime.min(minLength);
 return { runtime: runtime.max(maxLength), public: { type: 'string', ...(minLength === undefined ? {} : { minLength }), maxLength } };
};
const enumeration = values => ({ runtime: z.enum(values), public: { type: 'string', enum: values } });
const integer = (minimum, maximum) => ({ runtime: maximum === undefined ? z.number().int().min(minimum) : z.number().int().min(minimum).max(maximum), public: { type: 'integer', minimum, ...(maximum === undefined ? {} : { maximum }) } });
const object = (properties, required = []) => ({ type: 'object', additionalProperties: false, ...(required.length ? { required } : {}), properties });
const array = (items, maxItems, minItems) => ({ type: 'array', ...(minItems === undefined ? {} : { minItems }), maxItems, items });
const fields = {
 id: string(128, { minLength: 1 }), title: string(160, { minLength: 1, trim: true }),
 reason: string(600, { minLength: 1, trim: true }), text: string(300, { minLength: 1, trim: true }),
 result: string(600, { minLength: 1, trim: true }), description: string(2000), summary: string(800), blocker: string(600),
 status: enumeration(['pending', 'running', 'blocked', 'done']), check: enumeration(['tool', 'review', 'user']),
 section: enumeration(['item', 'verification']), op: enumeration(['add', 'edit', 'status', 'move', 'delete', 'reopen']),
 nonnegative: integer(0), limit: integer(1, 100),
};
const { id, title, reason, text, result, description, summary, blocker, status, check, section, nonnegative, limit } = Object.fromEntries(Object.entries(fields).map(([name, field]) => [name, field.runtime]));
const p = Object.fromEntries(Object.entries(fields).map(([name, field]) => [name, field.public]));
const MAX_CRITERIA = 10, MAX_REFS = 3, MAX_OPS = 100;
const acceptance = z.array(z.object({ criterionId: id, text, check: check.default('review') }).strict()).max(MAX_CRITERIA).refine(a => new Set(a.map(c => c.criterionId)).size === a.length);
const ref = z.union([z.object({ toolCallId: id }).strict(), z.object({ messageId: id }).strict()]);
const verification = z.array(z.object({ criterionId: id, result, refs: z.array(ref).max(MAX_REFS).default([]) }).strict()).max(MAX_CRITERIA);
const operation = z.discriminatedUnion('op', [
 z.object({ op: z.literal('add'), id: id.optional(), level: z.union([z.literal(1), z.literal(2)]), parentId: id.nullable().optional(), title, description: description.optional(), acceptance: acceptance.optional(), status: status.optional(), summary: summary.optional(), blocker: blocker.optional() }).strict(),
 z.object({ op: z.literal('edit'), id, title: title.optional(), description: description.optional(), acceptance: acceptance.optional(), summary: summary.optional() }).strict(),
 z.object({ op: z.literal('status'), id, status, summary: summary.optional(), blocker: blocker.optional(), verification: verification.optional() }).strict(),
 z.object({ op: z.literal('move'), id, beforeId: id.optional() }).strict(),
 z.object({ op: z.literal('delete'), id, reason }).strict(),
 z.object({ op: z.literal('reopen'), id, reason }).strict(),
]);
export const todoUpdateSchema = z.object({ listId: id.optional(), baseVersion: nonnegative, reason: reason.optional(), ops: z.array(operation).min(1).max(MAX_OPS) }).strict();
export const todoReadSchema = z.object({ listId: id.optional(), id: id.optional(), unfinished: z.boolean().default(false), detail: z.boolean().default(false), section: section.default('item'), includeDeleted: z.boolean().default(false), offset: nonnegative.default(0), limit: limit.default(20) }).strict();
export const todoReadParameters = object({ listId: p.id, id: p.id, unfinished: { type: 'boolean' }, detail: { type: 'boolean' }, section: p.section, includeDeleted: { type: 'boolean' }, offset: p.nonnegative, limit: p.limit });
export const todoUpdateParameters = object({
 listId: p.id, baseVersion: p.nonnegative, reason: p.reason,
 ops: array(object({
  op: p.op, id: p.id, level: { type: 'integer', enum: [1, 2] }, parentId: { ...p.id, type: ['string', 'null'] },
  title: p.title, description: p.description, summary: p.summary, blocker: p.blocker, reason: p.reason, status: p.status, beforeId: p.id,
  acceptance: array(object({ criterionId: p.id, text: p.text, check: p.check }, ['criterionId', 'text']), MAX_CRITERIA),
  verification: array(object({ criterionId: p.id, result: p.result, refs: array(object({ toolCallId: p.id, messageId: p.id }), MAX_REFS) }, ['criterionId', 'result']), MAX_CRITERIA),
 }, ['op']), MAX_OPS, 1),
}, ['baseVersion', 'ops']);
