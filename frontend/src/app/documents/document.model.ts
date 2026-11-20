/** One uploaded document of the client of the logged-in user, as the list shows it. */
export interface DocumentItem {
  id: string;
  /** The name the file had when it was uploaded. */
  name: string;
  sizeBytes: number;
  createdAt: string;
}
