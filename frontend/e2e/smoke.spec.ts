import { expect, test } from '@playwright/test';

test('app loads and renders the root component', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('DocManagement');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('the hello button shows the text returned by the API', async ({ page }) => {
  // The API is mocked so this test only needs the frontend dev server.
  await page.route('http://localhost:3000/', (route) =>
    route.fulfill({ contentType: 'text/plain', body: 'Hello World!' }),
  );
  await page.goto('/');

  await page.getByRole('button', { name: /say hello/i }).click();

  await expect(page.getByText('Hello World!')).toBeVisible();
});
