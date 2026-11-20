import { Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { parseOriginal, processedKey } from './document-key.js';
import { DocumentsRepository } from './documents.repository.js';
import { buildOkf } from './okf.js';
import { OBJECT_STORE } from './object-store.js';
import type { ObjectStore } from './document.model.js';
import { TikaClient } from './tika.client.js';
import type { DocumentEvent } from './document.model.js';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    @Inject(OBJECT_STORE) private readonly store: ObjectStore,
    private readonly tika: TikaClient,
    private readonly documents: DocumentsRepository,
  ) {}

  /** Turns one original into `processed/<client>/<doc>/document.md`, in the same bucket. Errors propagate so Pub/Sub retries. */
  async process(event: DocumentEvent): Promise<void> {
    // First, so the document is listed even when reading its text fails; a failure here retries the whole message.
    await this.record(event);
    const bytes = await this.store.download(event.bucket, event.name);
    const result = await this.tika.extract(bytes, event.contentType);
    const okf = buildOkf({
      title: result.title ?? event.name.split('/').pop() ?? event.name,
      resource: `gs://${event.bucket}/${event.name}`,
      created: new Date(),
      metadata: result.metadata,
      content: result.content,
    });
    const key = processedKey(event.name);
    if (key === undefined) throw new Error(`Not an original: ${event.name}`);
    await this.store.upload(event.bucket, key, okf);
  }

  /** Adds the document to its client's list. A file with no valid uploader (uploaded before the list existed) is skipped. */
  private async record(event: DocumentEvent): Promise<void> {
    const original = parseOriginal(event.name);
    const uploadedBy = z.uuid().safeParse(event.metadata?.['uploaded-by']);
    if (!original || !uploadedBy.success) {
      this.logger.warn(
        `Not adding ${event.name} to the list: no valid uploader`,
      );
      return;
    }
    const recorded = await this.documents.record({
      clientFolder: original.clientFolder,
      storagePath: event.name,
      originalName: original.fileName,
      sizeBytes: event.size,
      uploadedBy: uploadedBy.data,
    });
    if (!recorded) {
      this.logger.warn(
        `Not adding ${event.name} to the list: no client has that folder`,
      );
    }
  }
}
