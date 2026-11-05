import { inject, Service, signal } from '@angular/core';
import { PUT_FILE, UploadApi } from './upload-api';

export const MAX_FILE_BYTES = 100 * 1024 * 1024;
const MAX_FILES_PER_DROP = 20;
const PARALLEL_UPLOADS = 4;

export type UploadStatus = 'queued' | 'uploading' | 'done' | 'exists' | 'failed' | 'rejected';
export type UploadError = 'empty' | 'too-large' | 'too-many' | 'sign-failed' | 'upload-failed';

export interface UploadItem {
  id: number;
  file: File;
  status: UploadStatus;
  progress: number;
  error?: UploadError;
}

/** State of the upload list: validates, signs each file right before its PUT (URLs expire), runs 4 PUTs at a time. */
@Service()
export class UploadStore {
  private readonly api = inject(UploadApi);
  private readonly putFile = inject(PUT_FILE);
  private nextId = 1;

  readonly items = signal<UploadItem[]>([]);

  /** Resolves when every accepted file has finished (done, exists or failed). */
  async add(files: File[]): Promise<void> {
    const queued: number[] = [];
    const added: UploadItem[] = files.map((file, index) => {
      const item: UploadItem = { id: this.nextId++, file, status: 'queued', progress: 0 };
      const error = this.rejection(file, index, files);
      if (error === 'duplicate') return { ...item, status: 'exists' };
      if (error) return { ...item, status: 'rejected', error };
      queued.push(item.id);
      return item;
    });
    this.items.update((items) => [...items, ...added]);
    await this.runPool(queued);
  }

  async retry(id: number): Promise<void> {
    if (this.find(id)?.status !== 'failed') return;
    this.patch(id, { status: 'queued', progress: 0, error: undefined });
    await this.runPool([id]);
  }

  private rejection(
    file: File,
    index: number,
    drop: File[],
  ): UploadError | 'duplicate' | undefined {
    if (index >= MAX_FILES_PER_DROP) return 'too-many';
    if (file.size === 0) return 'empty';
    if (file.size > MAX_FILE_BYTES) return 'too-large';
    // Same name as a file already in the list (or earlier in this drop): the bucket would refuse it anyway.
    const listed = this.items().some(
      (i) => i.file.name === file.name && i.status !== 'failed' && i.status !== 'rejected',
    );
    const earlier = drop.slice(0, index).some((f) => f.name === file.name);
    return listed || earlier ? 'duplicate' : undefined;
  }

  private async runPool(ids: number[]): Promise<void> {
    const pending = [...ids];
    const worker = async () => {
      for (let id = pending.shift(); id !== undefined; id = pending.shift()) {
        await this.upload(id);
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL_UPLOADS, ids.length) }, worker));
  }

  private async upload(id: number): Promise<void> {
    const item = this.find(id);
    if (!item) return;
    try {
      const signed = await this.api.sign(item.file);
      this.patch(id, { status: 'uploading' });
      const status = await this.putFile(signed.url, signed.headers, item.file, (progress) =>
        this.patch(id, { progress }),
      );
      if (status >= 200 && status < 300) this.patch(id, { status: 'done', progress: 100 });
      else if (status === 412) this.patch(id, { status: 'exists' });
      else this.patch(id, { status: 'failed', error: 'upload-failed' });
    } catch {
      const stage = this.find(id)?.status === 'uploading' ? 'upload-failed' : 'sign-failed';
      this.patch(id, { status: 'failed', error: stage });
    }
  }

  private find(id: number): UploadItem | undefined {
    return this.items().find((item) => item.id === id);
  }

  private patch(id: number, changes: Partial<UploadItem>): void {
    this.items.update((items) =>
      items.map((item) => (item.id === id ? { ...item, ...changes } : item)),
    );
  }
}
