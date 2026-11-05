import { Storage } from '@google-cloud/storage';

export interface UrlSigner {
  /** V4 signed URL that accepts one PUT of a new object (fails with 412 if the name already exists). */
  sign(
    bucket: string,
    name: string,
    contentType: string,
    expires: Date,
  ): Promise<string>;
}

export const URL_SIGNER = Symbol('URL_SIGNER');

/** On Cloud Run the library signs through IAM signBlob as the service identity: no key file. */
export function gcsUrlSigner(storage = new Storage()): UrlSigner {
  return {
    async sign(bucket, name, contentType, expires) {
      const [url] = await storage
        .bucket(bucket)
        .file(name)
        .getSignedUrl({
          version: 'v4',
          action: 'write',
          expires,
          contentType,
          extensionHeaders: { 'x-goog-if-generation-match': '0' },
        });
      return url;
    },
  };
}
