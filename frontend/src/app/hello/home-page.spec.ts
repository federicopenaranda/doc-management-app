import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { fireEvent, render, screen } from '@testing-library/angular';
import { API_URL } from '../api-url';
import { AppConfigService } from '../app-config.service';
import { HomePage } from './home-page';

async function setup(uploadsEnabled = false) {
  await render(HomePage, {
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: API_URL, useValue: 'http://localhost:3000' },
      { provide: AppConfigService, useValue: { uploadsEnabled } },
    ],
  });
  return {
    http: TestBed.inject(HttpTestingController),
    button: screen.getByRole('button', { name: /say hello/i }),
  };
}

describe('HomePage', () => {
  it('should render title', async () => {
    await setup();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(
      'Hello, doc-management',
    );
  });

  it('shows nothing until the button is clicked', async () => {
    const { http } = await setup();
    expect(screen.queryByRole('status')?.textContent?.trim()).toBeFalsy();
    http.expectNone('http://localhost:3000/');
  });

  it('calls the API on click, disables the button while waiting, then shows the text', async () => {
    const { http, button } = await setup();

    await fireEvent.click(button);
    expect((button as HTMLButtonElement).disabled).toBe(true);

    http.expectOne('http://localhost:3000/').flush('Hello World!');

    expect(await screen.findByText('Hello World!')).toBeTruthy();
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });

  it('shows an accessible error when the API fails', async () => {
    const { http, button } = await setup();

    await fireEvent.click(button);
    http.expectOne('http://localhost:3000/').flush('boom', { status: 500, statusText: 'Error' });

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Could not reach the API');
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });

  it('links to the upload page only when the feature flag is on', async () => {
    await setup(true);
    expect(screen.getByRole('link', { name: /upload documents/i }).getAttribute('href')).toBe(
      '/upload',
    );
  });

  it('shows no upload link while the feature flag is off', async () => {
    await setup(false);
    expect(screen.queryByRole('link', { name: /upload documents/i })).toBeNull();
  });
});
