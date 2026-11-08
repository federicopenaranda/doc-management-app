import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_URL } from './api-url';
import { AppConfigService } from './app-config.service';

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  return {
    service: TestBed.inject(AppConfigService),
    http: TestBed.inject(HttpTestingController),
  };
}

describe('AppConfigService', () => {
  it('loads config.json and exposes apiUrl', async () => {
    const { service, http } = setup();

    const loading = service.load();
    http.expectOne('config.json').flush({ apiUrl: 'http://localhost:3000' });
    await loading;

    expect(service.apiUrl).toBe('http://localhost:3000');
  });

  it('removes a trailing slash from apiUrl', async () => {
    const { service, http } = setup();

    const loading = service.load();
    http.expectOne('config.json').flush({ apiUrl: 'https://api.example.com/' });
    await loading;

    expect(service.apiUrl).toBe('https://api.example.com');
  });

  it('rejects, naming config.json, when the file cannot be fetched', async () => {
    const { service, http } = setup();

    const loading = service.load();
    http.expectOne('config.json').flush('', { status: 404, statusText: 'Not Found' });

    await expect(loading).rejects.toThrow('config.json');
  });

  it.each([
    ['an empty object', {}],
    ['a number', { apiUrl: 3 }],
    ['a value without protocol', { apiUrl: 'localhost:3000' }],
    ['a non-http protocol', { apiUrl: 'ftp://files.example.com' }],
    ['a non-object file', ['http://localhost:3000']],
  ])('rejects %s, naming config.json', async (_label, body) => {
    const { service, http } = setup();

    const loading = service.load();
    http.expectOne('config.json').flush(body);

    await expect(loading).rejects.toThrow('config.json');
  });

  it.each([
    [{ apiUrl: 'http://localhost:3000' }, false],
    [{ apiUrl: 'http://localhost:3000', uploadsEnabled: false }, false],
    [{ apiUrl: 'http://localhost:3000', uploadsEnabled: true }, true],
    // Secrets are edited by hand: a quoted value is a common slip and must not stop the app.
    [{ apiUrl: 'http://localhost:3000', uploadsEnabled: 'true' }, true],
    [{ apiUrl: 'http://localhost:3000', uploadsEnabled: 'false' }, false],
  ])('reads the uploads flag from %j as %s (off when absent)', async (body, expected) => {
    const { service, http } = setup();

    const loading = service.load();
    http.expectOne('config.json').flush(body);
    await loading;

    expect(service.uploadsEnabled).toBe(expected);
  });

  it('rejects an uploadsEnabled that is not a boolean, naming config.json', async () => {
    const { service, http } = setup();

    const loading = service.load();
    http.expectOne('config.json').flush({ apiUrl: 'http://localhost:3000', uploadsEnabled: 'yes' });

    await expect(loading).rejects.toThrow('config.json');
  });

  it.each([
    [{ apiUrl: 'http://localhost:3000' }, false],
    [{ apiUrl: 'http://localhost:3000', shellEnabled: true }, true],
    [{ apiUrl: 'http://localhost:3000', shellEnabled: 'true' }, true],
    [{ apiUrl: 'http://localhost:3000', shellEnabled: 'false' }, false],
  ])('reads the shell flag from %j as %s (off when absent)', async (body, expected) => {
    const { service, http } = setup();

    const loading = service.load();
    http.expectOne('config.json').flush(body);
    await loading;

    expect(service.shellEnabled).toBe(expected);
  });

  it('rejects a shellEnabled that is not a boolean, naming the key', async () => {
    const { service, http } = setup();

    const loading = service.load();
    http.expectOne('config.json').flush({ apiUrl: 'http://localhost:3000', shellEnabled: 'yes' });

    await expect(loading).rejects.toThrow('"shellEnabled" must be true or false');
  });

  it('throws when apiUrl is read before the config is loaded', () => {
    const { service } = setup();

    expect(() => service.apiUrl).toThrow('config.json has not been loaded');
  });
});

describe('API_URL', () => {
  it('comes from the loaded config', async () => {
    const { service, http } = setup();

    const loading = service.load();
    http.expectOne('config.json').flush({ apiUrl: 'https://api.example.com' });
    await loading;

    expect(TestBed.inject(API_URL)).toBe('https://api.example.com');
  });
});
