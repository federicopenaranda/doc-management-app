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

/** Folder of one document inside its client's folder: `<file name slug>-<hash>`, the same for the original and the processed copy. */
export function docFolder(storageFolder: string, fileName: string): string {
  const hash = createHash('sha256')
    .update(`${storageFolder}\n${fileName}`)
    .digest('hex')
    .slice(0, 8);
  return `${slugOf(fileName)}-${hash}`;
}

/** Where an upload lands: `originals/<client folder>/<doc folder>/<file name>`. */
export function originalKey(storageFolder: string, fileName: string): string {
  return `originals/${storageFolder}/${docFolder(storageFolder, fileName)}/${fileName}`;
}

/**
 * Where the worker writes the result for an original: `processed/<client folder>/<doc folder>/document.md`.
 * Undefined for any object that is not `originals/<client>/<doc>/<file>`, so the worker ignores everything else.
 */
export function processedKey(originalName: string): string | undefined {
  const [root, client, doc, file, ...rest] = originalName.split('/');
  if (root !== 'originals' || !client || !doc || !file || rest.length > 0) {
    return undefined;
  }
  return `processed/${client}/${doc}/document.md`;
}
