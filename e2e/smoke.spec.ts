import { expect, test } from '@playwright/test';

test('loads the family tree and exposes primary navigation', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Генеалогическое древо')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Персона', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Архив', exact: true })).toBeVisible();
});

test('opens and closes backup dialog using keyboard', async ({ page }) => {
  await page.goto('/');
  const backupButton = page.getByRole('button', { name: 'Архив', exact: true });
  await backupButton.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  const closeButton = page.getByRole('dialog').getByRole('button').first();
  await closeButton.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeHidden();
});
