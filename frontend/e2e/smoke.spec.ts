import { expect, type Page, test } from '@playwright/test';

const ME = {
  id: 'u1',
  email: 'me@example.com',
  firstName: 'Me',
  lastName: 'Tester',
  language: 'en',
};

/** Every response of the API has the same shape (SCRUM-20): data on success, errors on failure. */
const ok = (data: unknown) =>
  JSON.stringify({
    success: true,
    code: 200,
    data,
    errors: [],
    meta: { correlationId: 'test', timestamp: new Date().toISOString() },
  });

/** The API is mocked, so these tests only need the frontend dev server. */
async function mockApi(page: Page, apiUrl: string) {
  await page.route('**/config.json', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ apiUrl }) }),
  );
  await page.route(`${apiUrl}/auth/login`, (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: ok({ accessToken: 'jwt-1', expiresIn: 3600, refreshToken: 'refresh-1' }),
    }),
  );
  await page.route(`${apiUrl}/auth/me`, (route) =>
    route.fulfill({ contentType: 'application/json', body: ok(ME) }),
  );
}

async function signIn(page: Page) {
  await page.getByLabel('Email').fill('me@example.com');
  await page.getByLabel('Password', { exact: true }).fill('a-long-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('the app loads and asks for a sign-in', async ({ page }) => {
  await mockApi(page, 'http://localhost:3000');

  await page.goto('/');

  await expect(page).toHaveTitle('DocManagement');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
});

test('signing in leads to the blank home page', async ({ page }) => {
  await mockApi(page, 'http://localhost:3000');
  await page.goto('/');

  await signIn(page);

  await expect(page).toHaveURL(/localhost:4200\/$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeAttached();
  await expect(page.getByRole('main').getByRole('link')).toHaveCount(0);
});

test('the API URL comes from config.json, not from the build', async ({ page }) => {
  await mockApi(page, 'http://localhost:4999');
  const loginRequest = page.waitForRequest('http://localhost:4999/auth/login');
  await page.goto('/');

  await signIn(page);

  expect((await loginRequest).method()).toBe('POST');
});
