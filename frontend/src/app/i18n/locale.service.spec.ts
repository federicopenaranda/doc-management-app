import { PlatformLocation } from '@angular/common';
import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LocaleService } from './locale.service';
import { NAVIGATE } from './locale';

function setup(localeId: string, baseHref: string) {
  const navigate = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      { provide: LOCALE_ID, useValue: localeId },
      { provide: PlatformLocation, useValue: { getBaseHrefFromDOM: () => baseHref } },
      { provide: NAVIGATE, useValue: navigate },
    ],
  });
  return { navigate, locale: TestBed.inject(LocaleService) };
}

describe('LocaleService', () => {
  it('knows the language of the copy it runs in', () => {
    expect(setup('es', '/es/').locale.current).toBe('es');
    TestBed.resetTestingModule();
    expect(setup('en-US', '/').locale.current).toBe('en');
  });

  it('is localized only under /en/ or /es/', () => {
    expect(setup('es', '/es/').locale.isLocalized()).toBe(true);
    TestBed.resetTestingModule();
    expect(setup('en-US', '/').locale.isLocalized()).toBe(false);
  });

  it('moves to the other copy when the saved language differs', () => {
    const { navigate, locale } = setup('es', '/es/');
    window.history.replaceState({}, '', '/es/users/1/edit?x=1#y');

    locale.redirectIfNeeded('en');

    expect(navigate).toHaveBeenCalledExactlyOnceWith('/en/users/1/edit?x=1#y');
  });

  it('stays when the saved language is the one of this copy', () => {
    const { navigate, locale } = setup('es', '/es/');

    locale.redirectIfNeeded('es');

    expect(navigate).not.toHaveBeenCalled();
  });

  it('never navigates on the dev server, which has no language prefix', () => {
    const { navigate, locale } = setup('en-US', '/');

    locale.redirectIfNeeded('es');
    locale.switchTo('es');

    expect(navigate).not.toHaveBeenCalled();
  });

  it('switchTo moves like redirectIfNeeded', () => {
    const { navigate, locale } = setup('en', '/en/');
    window.history.replaceState({}, '', '/en/upload');

    locale.switchTo('es');

    expect(navigate).toHaveBeenCalledExactlyOnceWith('/es/upload');
  });
});
