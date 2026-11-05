import { HttpClient } from '@angular/common/http';
import { inject, InjectionToken, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_URL } from '../api-url';

export interface SignedUpload {
  name: string;
  url: string;
  /** Headers the PUT must send exactly as listed (they are part of the signature). */
  headers: Record<string, string>;
}

/** Asks the backend for a signed URL to upload one file to the landing bucket. */
@Service()
export class UploadApi {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);

  async sign(file: File): Promise<SignedUpload> {
    const { uploads } = await firstValueFrom(
      this.http.post<{ uploads: SignedUpload[] }>(`${this.apiUrl}/uploads/sign`, {
        files: [
          {
            name: file.name,
            size: file.size,
            contentType: file.type || 'application/octet-stream',
          },
        ],
      }),
    );
    const signed = uploads.find((upload) => upload.name === file.name);
    if (!signed) throw new Error('The API returned no signed URL for the file');
    return signed;
  }
}

/** Resolves the HTTP status (the caller decides what it means); rejects only on network failure. */
export type PutFile = (
  url: string,
  headers: Record<string, string>,
  file: Blob,
  onProgress: (percent: number) => void,
) => Promise<number>;

/** XMLHttpRequest, because fetch cannot report upload progress. */
export const putWithProgress: PutFile = (url, headers, file, onProgress) =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => resolve(xhr.status);
    xhr.onerror = () => reject(new Error('Network error while uploading'));
    xhr.onabort = () => reject(new Error('Upload aborted'));
    xhr.send(file);
  });

export const PUT_FILE = new InjectionToken<PutFile>('PUT_FILE', {
  factory: () => putWithProgress,
});
