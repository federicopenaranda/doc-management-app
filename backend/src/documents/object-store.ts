import { Storage } from '@google-cloud/storage';

export interface ObjectStore {
  download(bucket: string, name: string): Promise<Buffer>;
  upload(bucket: string, path: string, text: string): Promise<void>;
}

export const OBJECT_STORE = Symbol('OBJECT_STORE');

export function gcsObjectStore(storage = new Storage()): ObjectStore {
  return {
    async download(bucket, name) {
      const [bytes] = await storage.bucket(bucket).file(name).download();
      return bytes;
    },
    async upload(bucket, path, text) {
      await storage.bucket(bucket).file(path).save(text, {
        contentType: 'text/markdown; charset=utf-8',
        resumable: false,
      });
    },
  };
}
