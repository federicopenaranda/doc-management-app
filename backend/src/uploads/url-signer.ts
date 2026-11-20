import { Storage } from '@google-cloud/storage';
import type { UrlSigner } from './upload.model.js';

export const URL_SIGNER = Symbol('URL_SIGNER');

/** On Cloud Run the library signs through IAM signBlob as the service identity: no key file. */
export function gcsUrlSigner(storage = new Storage()): UrlSigner {
  return {
    async sign(bucket, name, contentType, expires, headers) {
      const [url] = await storage
        .bucket(bucket)
        .file(name)
        .getSignedUrl({
          version: 'v4',
          action: 'write',
          expires,
          contentType,
          extensionHeaders: { 'x-goog-if-generation-match': '0', ...headers },
        });
      return url;
    },
    async signRead(bucket, name, expires) {
      const [url] = await storage
        .bucket(bucket)
        .file(name)
        .getSignedUrl({ version: 'v4', action: 'read', expires });
      return url;
    },
  };
}
