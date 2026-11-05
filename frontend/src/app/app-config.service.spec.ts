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
