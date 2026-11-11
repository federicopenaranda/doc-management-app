import { PlatformLocation } from '@angular/common';
import { inject, LOCALE_ID, Service } from '@angular/core';
import type { Language } from '../auth/auth.service';
import { languageOf, localizedUrl, NAVIGATE } from './locale';

/** Knows which language copy (/en/ or /es/) this page is, and moves to the other one. */
@Service()
export class LocaleService {
  private readonly navigate = inject(NAVIGATE);
  private readonly baseHref = inject(PlatformLocation).getBaseHrefFromDOM();

  readonly current: Language = languageOf(inject(LOCALE_ID));

  /** False on the dev server, where there is no language prefix and nothing to move to. */
  isLocalized(): boolean {
    return /^\/(?:en|es)\/$/.test(this.baseHref);
  }

  /** True when switching to this language leaves the page (a full load into the other copy). */
  wouldReload(language: Language): boolean {
    return this.isLocalized() && language !== this.current;
  }

  /** Opens the same page in the given language's copy; does nothing when already there. */
  switchTo(language: Language): void {
    if (this.wouldReload(language)) this.navigate(localizedUrl(language, window.location));
  }

  redirectIfNeeded(language: Language): void {
    this.switchTo(language);
  }
}
