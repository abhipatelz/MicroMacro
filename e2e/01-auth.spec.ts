import { test, expect, request } from '@playwright/test';
import { TEST_LEAD, ensureBootstrapLead, login } from './helpers';

test.describe('Authentication', () => {
  test.beforeAll(async ({ playwright }) => {
    const api = await playwright.request.newContext();
    await ensureBootstrapLead(api);
    await api.dispose();
  });

  test('login page renders Pragati mark + form, no broken images', async ({ page }) => {
    const broken: string[] = [];
    page.on('response', r => {
      const t = r.headers()['content-type'] || '';
      if (t.startsWith('image/') && r.status() >= 400) broken.push(r.url());
    });

    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    // Pragati mark — at least one rendered (could be hero + mobile, hidden via lg:)
    await expect(page.getByRole('img', { name: /pragati/i }).first()).toBeVisible();
    expect(broken).toEqual([]);
  });

  test('forgot-password link is reachable', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: /forgot/i }).click();
    await expect(page).toHaveURL(/\/forgot-password/);
    await expect(page.getByRole('heading', { name: /forgot password/i })).toBeVisible();
  });

  test('invalid credentials show error', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('nope@example.com');
    await page.getByLabel(/password/i).fill('wrongpass');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByText(/invalid credentials/i)).toBeVisible({ timeout: 8_000 });
  });

  test('valid credentials land on the dashboard', async ({ page }) => {
    await login(page);
    await expect(page).toHaveURL(/^http:\/\/[^/]+\/$/);
    await expect(page.getByText(/good (morning|afternoon|evening)|working late/i)).toBeVisible();
  });

  test('logout returns to /login', async ({ page }) => {
    await login(page);
    // Open the profile popover (trigger row in the sidebar footer).
    const profileTrigger = page.locator(`text=${TEST_LEAD.name}`).first();
    await profileTrigger.click();
    await page.getByRole('button', { name: /sign out/i }).first().click();
    // Confirm modal
    await page.getByRole('button', { name: /^sign out$/i }).last().click();
    await page.waitForURL(/\/login/, { timeout: 8_000 });
  });
});
