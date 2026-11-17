export interface SignedUpload {
  name: string;
  url: string;
  /** Headers the browser must send with the PUT, exactly as listed. */
  headers: Record<string, string>;
}

export interface UrlSigner {
  /** V4 signed URL that accepts one PUT of a new object (fails with 412 if the name already exists). */
  sign(
    bucket: string,
    name: string,
    contentType: string,
    expires: Date,
  ): Promise<string>;
}
