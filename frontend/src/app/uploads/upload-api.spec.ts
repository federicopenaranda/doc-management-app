import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_URL } from '../api-url';
import { putWithProgress, UploadApi } from './upload-api';

describe('UploadApi.sign', () => {
  function setup() {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_URL, useValue: 'http://localhost:3000' },
      ],
    });
    return { api: TestBed.inject(UploadApi), http: TestBed.inject(HttpTestingController) };
  }

  it('POSTs the file description and returns its signed upload', async () => {
    const { api, http } = setup();
    const file = new File(['hello'], 'a.txt', { type: 'text/plain' });

    const result = api.sign(file);

    const req = http.expectOne('http://localhost:3000/uploads/sign');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      files: [{ name: 'a.txt', size: 5, contentType: 'text/plain' }],
    });
    const signed = {
      name: 'a.txt',
      url: 'https://signed',
      headers: { 'Content-Type': 'text/plain' },
    };
    req.flush({ uploads: [signed] });
    await expect(result).resolves.toEqual(signed);
  });

  it('sends application/octet-stream when the browser does not know the type', async () => {
    const { api, http } = setup();

    const result = api.sign(new File(['x'], 'a.bin'));

    const req = http.expectOne('http://localhost:3000/uploads/sign');
    expect(req.request.body.files[0].contentType).toBe('application/octet-stream');
    req.flush({ uploads: [] });
    await expect(result).rejects.toThrow();
  });

  it('rejects when the API answers with an error', async () => {
    const { api, http } = setup();

    const result = api.sign(new File(['x'], 'a.txt'));

    http
      .expectOne('http://localhost:3000/uploads/sign')
      .flush('no', { status: 404, statusText: 'Not Found' });
    await expect(result).rejects.toBeDefined();
  });

  it('rejects when the response has no upload for the file', async () => {
    const { api, http } = setup();

    const result = api.sign(new File(['x'], 'a.txt'));

    http.expectOne('http://localhost:3000/uploads/sign').flush({ uploads: [] });
    await expect(result).rejects.toThrow();
  });
});

interface FakeProgressEvent {
  lengthComputable: boolean;
  loaded: number;
  total: number;
}

class FakeXhr {
  static last: FakeXhr;
  method = '';
  url = '';
  headers: Record<string, string> = {};
  body: unknown;
  status = 0;
  upload: { onprogress: ((e: FakeProgressEvent) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  constructor() {
    FakeXhr.last = this;
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send(body: unknown) {
    this.body = body;
  }
}

describe('putWithProgress', () => {
  beforeEach(() => vi.stubGlobal('XMLHttpRequest', FakeXhr));
  afterEach(() => vi.unstubAllGlobals());

  it('PUTs the file with the given headers and reports progress in percent', async () => {
    const file = new File(['12345678'], 'a.txt');
    const progress: number[] = [];

    const result = putWithProgress(
      'https://signed',
      { 'Content-Type': 'text/plain', 'x-goog-if-generation-match': '0' },
      file,
      (p) => progress.push(p),
    );

    const xhr = FakeXhr.last;
    expect(xhr.method).toBe('PUT');
    expect(xhr.url).toBe('https://signed');
    expect(xhr.headers).toEqual({
      'Content-Type': 'text/plain',
      'x-goog-if-generation-match': '0',
    });
    expect(xhr.body).toBe(file);
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 2, total: 8 });
    xhr.upload.onprogress?.({ lengthComputable: false, loaded: 0, total: 0 });
    xhr.status = 200;
    xhr.onload?.();
    await expect(result).resolves.toBe(200);
    expect(progress).toEqual([25]);
  });

  it('resolves the status of an HTTP error (the caller decides what 412 means)', async () => {
    const result = putWithProgress('https://signed', {}, new File(['x'], 'a'), () => undefined);

    FakeXhr.last.status = 412;
    FakeXhr.last.onload?.();

    await expect(result).resolves.toBe(412);
  });

  it('rejects on a network error', async () => {
    const result = putWithProgress('https://signed', {}, new File(['x'], 'a'), () => undefined);

    FakeXhr.last.onerror?.();

    await expect(result).rejects.toThrow();
  });
});
