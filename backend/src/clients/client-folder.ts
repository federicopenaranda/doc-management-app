const MAX_SLUG = 40;

/**
 * Folder of a client in the bucket: `<name-slug>-<yyyymmdd>-<first 8 of the id>`. Computed once when the client is
 * created and stored; a later rename must not move the files, so it is never recomputed.
 */
export function clientFolder(
  name: string,
  createdAt: Date,
  id: string,
): string {
  const slug =
    name
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, MAX_SLUG)
      .replace(/-+$/, '') || 'client';
  const day = createdAt.toISOString().slice(0, 10).replaceAll('-', '');
  return `${slug}-${day}-${id.slice(0, 8)}`;
}
