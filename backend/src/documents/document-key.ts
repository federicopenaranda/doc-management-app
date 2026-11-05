import { createHash } from 'node:crypto';

const MAX_SLUG = 60;

function slugOf(objectName: string): string {
  const fileName = objectName.split('/').pop() ?? '';
  const slug = fileName
    .replace(/\.[^.]*$/, '') // extension
    .normalize('NFKD')
    .replace(/\p{M}/gu, '') // diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG)
    .replace(/-+$/, '');
  return slug || 'document';
}

/**
 * Folder of a processed document: `<slug>-<hash>`. Deterministic, so a redelivered message
 * overwrites the same folder; a new generation of the same object gets a new one.
 */
export function documentFolder(
  bucket: string,
  objectName: string,
  generation: string,
): string {
  const hash = createHash('sha256')
    .update(`${bucket}\n${objectName}\n${generation}`)
    .digest('hex')
    .slice(0, 8);
  return `${slugOf(objectName)}-${hash}`;
}
