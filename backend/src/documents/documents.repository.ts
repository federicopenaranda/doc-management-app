import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import type { DocumentSummary, NewDocument } from './document.model.js';

@Injectable()
export class DocumentsRepository {
  // null while the DATABASE_ENABLED feature flag is off.
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService | null,
  ) {}

  private get pool() {
    if (!this.db) throw new Error('The database feature is not enabled');
    return this.db.pool;
  }

  /**
   * Adds the document to the client that owns the folder in its path. The same path again (a redelivered message) only
   * refreshes the size and the update time. False when no client has that folder, so nothing was recorded.
   */
  async record(document: NewDocument): Promise<boolean> {
    const { rows } = await this.pool.query<{ id: string }>(
      'INSERT INTO documents (client_id, storage_path, original_name, size_bytes, uploaded_by) SELECT id, $2, $3, $4, $5 FROM clients WHERE storage_folder = $1 ON CONFLICT (storage_path) DO UPDATE SET size_bytes = EXCLUDED.size_bytes, updated_at = now() RETURNING id',
      [
        document.clientFolder,
        document.storagePath,
        document.originalName,
        document.sizeBytes,
        document.uploadedBy,
      ],
    );
    return rows.length > 0;
  }

  /** The documents of one client, newest first. */
  async listForClient(clientId: string): Promise<DocumentSummary[]> {
    const { rows } = await this.pool.query<{
      id: string;
      original_name: string;
      size_bytes: string;
      created_at: Date;
    }>(
      'SELECT id, original_name, size_bytes, created_at FROM documents WHERE client_id = $1 ORDER BY created_at DESC, id',
      [clientId],
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.original_name,
      // bigint arrives as text; a file is far below 2^53 bytes.
      sizeBytes: Number(row.size_bytes),
      createdAt: row.created_at,
    }));
  }

  /** Where the file is in the bucket, only for a document of that client; null otherwise. */
  async pathOf(id: string, clientId: string): Promise<string | null> {
    const { rows } = await this.pool.query<{ storage_path: string }>(
      'SELECT storage_path FROM documents WHERE id = $1 AND client_id = $2',
      [id, clientId],
    );
    return rows[0]?.storage_path ?? null;
  }
}
