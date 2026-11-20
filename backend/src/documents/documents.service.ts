import { Inject, Injectable } from '@nestjs/common';
import { processedKey } from './document-key.js';
import { buildOkf } from './okf.js';
import { OBJECT_STORE } from './object-store.js';
import type { ObjectStore } from './document.model.js';
import { TikaClient } from './tika.client.js';
import type { DocumentEvent } from './document.model.js';

@Injectable()
export class DocumentsService {
  constructor(
    @Inject(OBJECT_STORE) private readonly store: ObjectStore,
    private readonly tika: TikaClient,
  ) {}

  /** Turns one original into `processed/<client>/<doc>/document.md`, in the same bucket. Errors propagate so Pub/Sub retries. */
  async process(event: DocumentEvent): Promise<void> {
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
}
