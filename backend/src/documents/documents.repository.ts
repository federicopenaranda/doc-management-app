import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import type { NewDocument } from './document.model.js';

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
}
