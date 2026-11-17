export type Language = 'en' | 'es';

/** Who is logged in, as the toolbar shows it. */
export interface CurrentUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  language: Language;
}
