import { Service, signal } from '@angular/core';

export type Scheme = 'light' | 'dark';

// index.html reads the same key before the app starts, so the saved theme shows on first paint.
const STORAGE_KEY = 'dms-theme';

function isScheme(value: unknown): value is Scheme {
  return value === 'light' || value === 'dark';
}

function readSaved(): Scheme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isScheme(value) ? value : null;
  } catch {
    return null; // storage blocked: follow the computer for this visit
  }
}

/** The user's light/dark choice. Without a saved choice the page follows the computer's setting. */
@Service()
export class ThemeService {
  // shortcut: with no saved choice the label does not follow live OS changes, upgrade if that matters.
  readonly scheme = signal<Scheme>(this.initialScheme());

  toggle(): void {
    const next: Scheme = this.scheme() === 'dark' ? 'light' : 'dark';
    this.scheme.set(next);
    document.documentElement.style.colorScheme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // storage blocked: the choice lasts for this visit only
    }
  }

  private initialScheme(): Scheme {
    const saved = readSaved();
    if (saved) {
      document.documentElement.style.colorScheme = saved;
      return saved;
    }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
}
