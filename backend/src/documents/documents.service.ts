import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.validation.js';
import { documentFolder } from './document-key.js';
import { buildOkf } from './okf.js';
import { OBJECT_STORE, type ObjectStore } from './object-store.js';
import { TikaClient } from './tika.client.js';

export interface DocumentEvent {
  bucket: string;
  name: string;
  generation: string;
  contentType?: string | undefined;
}

@Injectable()
export class DocumentsService {
  constructor(
    @Inject(OBJECT_STORE) private readonly store: ObjectStore,
    private readonly tika: TikaClient,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Turns one uploaded file into `<folder>/document.md` in the processed bucket. Errors propagate so Pub/Sub retries. */
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
    const folder = documentFolder(event.bucket, event.name, event.generation);
    await this.store.upload(
      this.config.get('PROCESSED_BUCKET', { infer: true }) as string,
      `${folder}/document.md`,
      okf,
    );
  }
}
