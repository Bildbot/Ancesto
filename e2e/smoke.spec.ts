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

test('keeps the production app shell and its entry assets available offline', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByText('Генеалогическое древо')).toBeVisible();
  await expect.poll(() => page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration())?.active))).toBe(true);
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  expect(await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return Boolean(await caches.match(new URL('index.html', registration!.scope).toString()));
  })).toBe(true);
  await context.setOffline(true);
  const cachedShell = await page.evaluate(async () => {
    const response = await caches.match(new URL('index.html', location.href).toString());
    if (!response) return null;
    const html = await response.text();
    const assetUrls = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)]
      .map((match) => new URL(match[1], location.href).toString());
    const cachedAssets = await Promise.all(assetUrls.map((url) => caches.match(url)));
    return { html, assetsCached: cachedAssets.every(Boolean) };
  });
  expect(cachedShell?.html).toContain('<div id="root"></div>');
  expect(cachedShell?.assetsCached).toBe(true);
  await expect(page.getByText('Древо готово к заполнению')).toBeVisible();
});
