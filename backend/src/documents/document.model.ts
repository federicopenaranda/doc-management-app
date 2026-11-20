export interface DocumentEvent {
  bucket: string;
  name: string;
  generation: string;
  contentType?: string | undefined;
  /** Bytes, as Cloud Storage reports them. */
  size: number;
  /** Custom metadata of the object, without the x-goog-meta- prefix (the upload puts `uploaded-by` here). */
  metadata?: Record<string, string> | undefined;
}

/** A document to add to the list of its client. */
export interface NewDocument {
  clientFolder: string;
  storagePath: string;
  originalName: string;
  sizeBytes: number;
  uploadedBy: string;
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
