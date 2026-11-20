export interface SignedUpload {
  name: string;
  url: string;
  /** Headers the PUT must send exactly as listed (they are part of the signature). */
  headers: Record<string, string>;
}

/** Resolves the HTTP status (the caller decides what it means); rejects only on network failure. */
export type PutFile = (
  url: string,
  headers: Record<string, string>,
  file: Blob,
  onProgress: (percent: number) => void,
) => Promise<number>;

export type UploadStatus = 'queued' | 'uploading' | 'done' | 'exists' | 'failed' | 'rejected';

export type UploadError =
  'empty' | 'too-large' | 'too-many' | 'sign-failed' | 'upload-failed' | 'not-allowed';

export interface UploadItem {
  id: number;
  file: File;
  status: UploadStatus;
  progress: number;
  error?: UploadError;
}
