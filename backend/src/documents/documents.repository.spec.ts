import type { DatabaseService } from '../database/database.service.js';
import { DocumentsRepository } from './documents.repository.js';

const entry = {
  clientFolder: 'acme-20261103-3f9a1c2b',
  storagePath: 'originals/acme-20261103-3f9a1c2b/report-9c1e47ab/Report.pdf',
  originalName: 'Report.pdf',
  sizeBytes: 1234,
  uploadedBy: '6f1e0f0e-5d3c-4b7a-9d52-0a1f3c2b7e11',
};

function setup(rows: unknown[] = [{ id: 'd1' }]) {
  const query = vi.fn().mockResolvedValue({ rows });
  return {
    query,
    repository: new DocumentsRepository({
      pool: { query },
    } as unknown as DatabaseService),
  };
}

describe('DocumentsRepository.record', () => {
  it('adds the document of the client that owns the folder, with bound parameters', async () => {
    const { repository, query } = setup();

    expect(await repository.record(entry)).toBe(true);

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/^INSERT INTO documents/);
    expect(sql).toContain('FROM clients WHERE storage_folder = $1');
    expect(params).toEqual([
      entry.clientFolder,
      entry.storagePath,
      entry.originalName,
      entry.sizeBytes,
      entry.uploadedBy,
    ]);
  });

  it('updates the size and the update time when the same path arrives again (a redelivered message)', async () => {
    const { repository, query } = setup();

    await repository.record(entry);

    const [sql] = query.mock.calls[0] as [string];
    expect(sql).toContain('ON CONFLICT (storage_path) DO UPDATE');
    expect(sql).toContain('updated_at = now()');
    expect(sql).not.toContain('created_at =');
  });

  it('is false when no client has that folder, so nothing was recorded', async () => {
    const { repository } = setup([]);

    expect(await repository.record(entry)).toBe(false);
  });
});
