import { InjectionToken } from '@angular/core';
import type { Language } from '../auth/auth.service';

/** The language a build copy was made for; `ng serve` runs the source language with the id `en-US`. */
export const languageOf = (localeId: string): Language => (localeId.startsWith('es') ? 'es' : 'en');

/** The same page in another language: swaps the leading /en or /es and keeps the path, query and hash. */
export const localizedUrl = (
  language: Language,
  { pathname, search, hash }: { pathname: string; search: string; hash: string },
): string => `/${language}${pathname.replace(/^\/(?:en|es)(?=\/|$)/, '')}${search}${hash}`;

/** A full page load; a token so tests can watch it instead of leaving the page. */
export const NAVIGATE = new InjectionToken<(url: string) => void>('NAVIGATE', {
  factory: () => (url) => window.location.assign(url),
});
