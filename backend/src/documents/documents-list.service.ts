import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersRepository } from '../auth/users.repository.js';
import type { Env } from '../config/env.validation.js';
import type { UrlSigner } from '../uploads/upload.model.js';
import { NOW } from '../uploads/uploads.service.js';
import { URL_SIGNER } from '../uploads/url-signer.js';
import type { DocumentSummary } from './document.model.js';
import { DocumentsRepository } from './documents.repository.js';

const VALID_FOR_MS = 15 * 60 * 1000;

/** What a user sees of documents: only those of their own client. */
@Injectable()
export class DocumentsListService {
  constructor(
    private readonly users: UsersRepository,
    private readonly documents: DocumentsRepository,
    @Inject(URL_SIGNER) private readonly signer: UrlSigner,
    private readonly config: ConfigService<Env, true>,
    @Inject(NOW) private readonly now: () => Date,
  ) {}

  /** shortcut: no paging, every document of the client at once; add it when a client has thousands. */
  async list(userId: string): Promise<DocumentSummary[]> {
    const clientId = await this.clientOf(userId);
    return clientId ? this.documents.listForClient(clientId) : [];
  }

  /** A link that opens the original for 15 minutes. 404 unless the document belongs to the client of the user. */
  async viewUrl(userId: string, id: string): Promise<{ url: string }> {
    const clientId = await this.clientOf(userId);
    const path = clientId ? await this.documents.pathOf(id, clientId) : null;
    if (path === null) throw new NotFoundException('Document not found');
    const expires = new Date(this.now().getTime() + VALID_FOR_MS);
    const bucket = this.config.get('GCS_BUCKET', { infer: true });
    return { url: await this.signer.signRead(bucket, path, expires) };
  }

  private async clientOf(userId: string): Promise<string | null> {
    return (await this.users.getSummary(userId))?.clientId ?? null;
  }
}
