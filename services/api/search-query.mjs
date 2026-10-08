import { createHash } from 'node:crypto';
export function normalizeSearchQuery(value = '') {
  if (typeof value !== 'string' || value.length > 512 || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error('Invalid search query');
  const query = value.trim();
  if ([...query].length > 100) throw new Error('Invalid search query');
  return query;
}
export const searchQueryHash = value => createHash('sha256').update(normalizeSearchQuery(value), 'utf8').digest('hex');
