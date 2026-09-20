import { cp, lstat } from 'node:fs/promises';

export function rewriteSourceRefs(value, mappings) {
  if (typeof value === 'string') {
    for (const [oldFile, newFile] of mappings) value = value.split(`${oldFile}.sources`).join(`${newFile}.sources`);
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => rewriteSourceRefs(item, mappings));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewriteSourceRefs(item, mappings)]));
  return value;
}

export async function copySourceArchive(oldFile, newFile) {
  const source = `${oldFile}.sources`;
  const info = await lstat(source).catch((error) => { if (error.code === 'ENOENT') return null; throw error; });
  if (!info) return;
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Invalid source archive directory');
  await cp(source, `${newFile}.sources`, { recursive: true, errorOnExist: true, force: false, filter: async (path) => {
    const info = await lstat(path);
    if (info.isSymbolicLink()) throw new Error('Source archive cannot contain symlinks');
    return !path.endsWith('.tmp');
  } });
}
