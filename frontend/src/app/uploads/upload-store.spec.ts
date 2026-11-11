import { TestBed } from '@angular/core/testing';
import { PUT_FILE, UploadApi, type SignedUpload } from './upload-api';
import { MAX_FILE_BYTES, UploadStore } from './upload-store';

interface PendingPut {
  name: string;
  resolve: (status: number) => void;
  reject: (error: Error) => void;
  onProgress: (percent: number) => void;
}

function setup() {
  const puts: PendingPut[] = [];
  const sign = vi.fn<(file: File) => Promise<SignedUpload>>().mockImplementation((file) =>
    Promise.resolve({
      name: file.name,
      url: `https://signed/${file.name}`,
      headers: { 'Content-Type': 'text/plain' },
    }),
  );
  const put = vi.fn(
    (_url: string, _headers: Record<string, string>, file: Blob, onProgress: (p: number) => void) =>
      new Promise<number>((resolve, reject) => {
        puts.push({ name: (file as File).name, resolve, reject, onProgress });
      }),
  );
  TestBed.configureTestingModule({
    providers: [
      { provide: UploadApi, useValue: { sign } },
      { provide: PUT_FILE, useValue: put },
    ],
  });
  const store = TestBed.inject(UploadStore);
  const statuses = () => store.items().map((i) => `${i.file.name}:${i.status}`);
  const files = (...names: string[]) => names.map((n) => new File(['x'], n));
  return { store, sign, put, puts, statuses, files };
}

describe('UploadStore', () => {
  it('signs, uploads and marks a file done, with progress', async () => {
    const { store, put, puts, statuses, files } = setup();

    const finished = store.add(files('a.txt'));
    await vi.waitFor(() => expect(puts).toHaveLength(1));
    expect(put).toHaveBeenCalledWith(
      'https://signed/a.txt',
      { 'Content-Type': 'text/plain' },
      expect.any(File),
      expect.any(Function),
    );
    expect(statuses()).toEqual(['a.txt:uploading']);
    puts[0]!.onProgress(40);
    expect(store.items()[0]!.progress).toBe(40);
    puts[0]!.resolve(200);
    await finished;

    expect(statuses()).toEqual(['a.txt:done']);
    expect(store.items()[0]!.progress).toBe(100);
  });

  it('uploads at most 4 files in parallel and starts the next as one finishes', async () => {
    const { store, puts, files } = setup();

    const finished = store.add(files('1', '2', '3', '4', '5', '6'));
    await vi.waitFor(() => expect(puts).toHaveLength(4));
    await new Promise((r) => setTimeout(r, 0));
    expect(puts).toHaveLength(4);

    puts[0]!.resolve(200);
    await vi.waitFor(() => expect(puts).toHaveLength(5));
    puts[1]!.resolve(200);
    await vi.waitFor(() => expect(puts).toHaveLength(6));
    for (const p of puts.slice(2)) p.resolve(200);
    await finished;

    expect(store.items().every((i) => i.status === 'done')).toBe(true);
  });

  it('marks a 412 as "exists" and other statuses or network errors as "failed"', async () => {
    const { store, puts, statuses, files } = setup();

    const finished = store.add(files('dup.txt', 'bad.txt', 'net.txt'));
    await vi.waitFor(() => expect(puts).toHaveLength(3));
    puts[0]!.resolve(412);
    puts[1]!.resolve(403);
    puts[2]!.reject(new Error('network'));
    await finished;

    expect(statuses()).toEqual(['dup.txt:exists', 'bad.txt:failed', 'net.txt:failed']);
  });

  it('marks a file failed, and keeps going, when signing fails', async () => {
    const { store, sign, puts, statuses, files } = setup();
    sign.mockRejectedValueOnce(new Error('404'));

    const finished = store.add(files('a.txt', 'b.txt'));
    await vi.waitFor(() => expect(puts).toHaveLength(1));
    puts[0]!.resolve(200);
    await finished;

    expect(statuses()).toEqual(['a.txt:failed', 'b.txt:done']);
    expect(store.items()[0]!.error).toBe('sign-failed');
  });

  it('rejects empty and oversized files without calling the API', async () => {
    const { store, sign, statuses } = setup();
    const empty = new File([], 'empty.txt');
    const big = new File(['x'], 'big.bin');
    Object.defineProperty(big, 'size', { value: MAX_FILE_BYTES + 1 });

    await store.add([empty, big]);

    expect(statuses()).toEqual(['empty.txt:rejected', 'big.bin:rejected']);
    expect(store.items().map((i) => i.error)).toEqual(['empty', 'too-large']);
    expect(sign).not.toHaveBeenCalled();
  });

  it('accepts a file of exactly 100 MB', async () => {
    const { store, puts } = setup();
    const exact = new File(['x'], 'exact.bin');
    Object.defineProperty(exact, 'size', { value: MAX_FILE_BYTES });

    void store.add([exact]);

    await vi.waitFor(() => expect(puts).toHaveLength(1));
  });

  it('accepts at most 20 files per drop and rejects the rest', async () => {
    const { store, puts, files } = setup();
    const names = Array.from({ length: 22 }, (_, i) => `f${i}.txt`);

    const finished = store.add(files(...names));
    for (let i = 0; i < 20; i++) {
      await vi.waitFor(() => expect(puts.length).toBeGreaterThan(i));
      puts[i]!.resolve(200);
    }
    await finished;

    expect(store.items().filter((i) => i.status === 'done')).toHaveLength(20);
    expect(
      store
        .items()
        .slice(20)
        .map((i) => `${i.status}:${i.error}`),
    ).toEqual(['rejected:too-many', 'rejected:too-many']);
  });

  it('does not upload a name that is already in the list twice', async () => {
    const { store, puts, statuses, files } = setup();

    const first = store.add(files('a.txt'));
    await vi.waitFor(() => expect(puts).toHaveLength(1));
    await store.add(files('a.txt'));
    puts[0]!.resolve(200);
    await first;

    expect(puts).toHaveLength(1);
    expect(statuses()).toEqual(['a.txt:done', 'a.txt:exists']);
  });

  it('retries a failed file, signing again', async () => {
    const { store, sign, puts, statuses, files } = setup();
    const first = store.add(files('a.txt'));
    await vi.waitFor(() => expect(puts).toHaveLength(1));
    puts[0]!.resolve(500);
    await first;
    expect(statuses()).toEqual(['a.txt:failed']);

    const retry = store.retry(store.items()[0]!.id);
    await vi.waitFor(() => expect(puts).toHaveLength(2));
    puts[1]!.resolve(200);
    await retry;

    expect(sign).toHaveBeenCalledTimes(2);
    expect(statuses()).toEqual(['a.txt:done']);
  });

  it('does not retry a file that is not failed', async () => {
    const { store, sign, puts, files } = setup();
    const finished = store.add(files('a.txt'));
    await vi.waitFor(() => expect(puts).toHaveLength(1));

    await store.retry(store.items()[0]!.id);

    expect(sign).toHaveBeenCalledTimes(1);
    puts[0]!.resolve(200);
    await finished;
  });

  it('counts the files that are still waiting or uploading', async () => {
    const { store, puts, files } = setup();
    expect(store.activeCount()).toBe(0);

    const finished = store.add(files('a.txt', 'b.txt'));
    await vi.waitFor(() => expect(puts).toHaveLength(2));
    expect(store.activeCount()).toBe(2);

    puts[0]!.resolve(200);
    await vi.waitFor(() => expect(store.activeCount()).toBe(1));
    puts[1]!.resolve(200);
    await finished;
    expect(store.activeCount()).toBe(0);
  });
});
