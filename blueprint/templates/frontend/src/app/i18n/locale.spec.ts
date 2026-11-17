import { languageOf, localizedUrl } from './locale';

describe('languageOf', () => {
  it.each(['es', 'es-BO'])('maps %s to Spanish', (localeId) => {
    expect(languageOf(localeId)).toBe('es');
  });

  it.each(['en', 'en-US'])('maps %s to English', (localeId) => {
    expect(languageOf(localeId)).toBe('en');
  });
});

describe('localizedUrl', () => {
  it('swaps the language prefix and keeps the path, query and hash', () => {
    expect(localizedUrl('en', { pathname: '/es/users/abc/edit', search: '?x=1', hash: '#y' })).toBe(
      '/en/users/abc/edit?x=1#y',
    );
  });

  it('handles a bare prefix', () => {
    expect(localizedUrl('es', { pathname: '/en', search: '', hash: '' })).toBe('/es');
  });

  it('does not touch a path that only starts with the letters of a prefix', () => {
    expect(localizedUrl('es', { pathname: '/entries', search: '', hash: '' })).toBe('/es/entries');
  });
});
