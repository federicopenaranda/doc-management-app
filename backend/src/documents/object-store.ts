import { Storage } from '@google-cloud/storage';
import type { ObjectStore } from './document.model.js';

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
