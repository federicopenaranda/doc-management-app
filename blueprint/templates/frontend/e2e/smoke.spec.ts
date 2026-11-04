import { expect, test } from '@playwright/test';

test('app loads and renders the root component', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/\S/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});
