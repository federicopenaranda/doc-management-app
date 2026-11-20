export interface SignedUpload {
  name: string;
  url: string;
  /** Headers the browser must send with the PUT, exactly as listed. */
  headers: Record<string, string>;
}

export interface UrlSigner {
  /**
   * V4 signed URL that accepts one PUT of a new object (fails with 412 if the name already exists). `headers` are signed
   * too, so the browser must send exactly them (the uploader's id travels this way, as object metadata).
   */
  sign(
    bucket: string,
    name: string,
    contentType: string,
    expires: Date,
    headers: Record<string, string>,
  ): Promise<string>;
  /** V4 signed URL that lets anyone who has it read one object until it expires. */
  signRead(bucket: string, name: string, expires: Date): Promise<string>;
}
