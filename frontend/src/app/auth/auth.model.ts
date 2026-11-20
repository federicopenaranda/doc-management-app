export type Language = 'en' | 'es';

/** Who is logged in, as the toolbar shows it. */
export interface CurrentUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  language: Language;
  /** True for an editor or admin of an active client: the only users who may upload. */
  canUpload: boolean;
}
