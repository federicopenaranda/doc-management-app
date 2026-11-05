import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.validation.js';
import { URL_SIGNER, type UrlSigner } from './url-signer.js';
import type { FileRequest } from './uploads.schema.js';

export interface SignedUpload {
  name: string;
  url: string;
  /** Headers the browser must send with the PUT, exactly as listed. */
  headers: Record<string, string>;
}

const VALID_FOR_MS = 15 * 60 * 1000;
export const NOW = Symbol('NOW');

@Injectable()
export class UploadsService {
  constructor(
    @Inject(URL_SIGNER) private readonly signer: UrlSigner,
    private readonly config: ConfigService<Env, true>,
    @Inject(NOW) private readonly now: () => Date,
  ) {}

  async sign(files: FileRequest[]): Promise<SignedUpload[]> {
    const bucket = this.config.get('GCS_BUCKET', { infer: true });
    const expires = new Date(this.now().getTime() + VALID_FOR_MS);
    return Promise.all(
      files.map(async ({ name, contentType }) => ({
        name,
        url: await this.signer.sign(bucket, name, contentType, expires),
        headers: {
          'Content-Type': contentType,
          'x-goog-if-generation-match': '0',
        },
      })),
    );
  }
}
