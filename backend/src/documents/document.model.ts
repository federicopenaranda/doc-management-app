export interface DocumentEvent {
  bucket: string;
  name: string;
  generation: string;
  contentType?: string | undefined;
}

export interface ObjectStore {
  download(bucket: string, name: string): Promise<Buffer>;
  upload(bucket: string, path: string, text: string): Promise<void>;
}

export interface OkfInput {
  title: string;
  resource: string;
  created: Date;
  metadata: Record<string, string | string[]>;
  content: string;
}

export interface TikaResult {
  title: string | undefined;
  content: string;
  metadata: Record<string, string | string[]>;
}
