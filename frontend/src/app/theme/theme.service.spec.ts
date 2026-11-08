import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

const KEY = 'dms-theme';

function setup(): ThemeService {
  return TestBed.inject(ThemeService);
}

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.style.colorScheme = '';
  });

  afterEach(() => vi.restoreAllMocks());

  it('starts light, and leaves the page following the computer, when nothing is saved', () => {
    const theme = setup();

    expect(theme.scheme()).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('');
  });

  it('starts dark when the computer prefers dark and nothing is saved', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));

    expect(setup().scheme()).toBe('dark');

    vi.unstubAllGlobals();
  });

  it('uses the saved choice over the computer setting', () => {
    localStorage.setItem(KEY, 'dark');

    const theme = setup();

    expect(theme.scheme()).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it.each(['', 'blue', 'null', '{}'])('ignores the junk saved value %j', (junk) => {
    localStorage.setItem(KEY, junk);

    const theme = setup();

    expect(theme.scheme()).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('');
  });

  it('toggle switches the scheme, the page and the saved choice', () => {
    const theme = setup();

    theme.toggle();

    expect(theme.scheme()).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(localStorage.getItem(KEY)).toBe('dark');

    theme.toggle();

    expect(theme.scheme()).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
    expect(localStorage.getItem(KEY)).toBe('light');
  });

  it('still switches for this visit when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const theme = setup();

    theme.toggle();

    expect(theme.scheme()).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });
});
