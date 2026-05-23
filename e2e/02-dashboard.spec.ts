import { test, expect } from '@playwright/test';
import { TEST_LEAD, ensureBootstrapLead, login } from './helpers';

test.describe('Dashboard', () => {
  test.beforeAll(async ({ playwright }) => {
    const api = await playwright.request.newContext();
    await ensureBootstrapLead(api);
    await api.dispose();
  });

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('greeting + four summary chips are visible', async ({ page }) => {
    await expect(page.getByText(/good (morning|afternoon|evening)|working late/i)).toBeVisible();
    for (const label of ['Ongoing projects', 'Open tasks', 'Overdue', 'Team']) {
      await expect(page.getByText(new RegExp(label, 'i')).first()).toBeVisible();
    }
  });

  test('Projects column + Actions panel + Contributors panel render', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /projects you lead/i })).toBeVisible();
    await expect(page.getByText(/^actions$/i)).toBeVisible();
    await expect(page.getByText(/individual contributors/i)).toBeVisible();
  });

  test('Action filter chips switch and "Until..." reveals a date picker', async ({ page }) => {
    await page.getByRole('button', { name: /next week/i }).click();
    await page.getByRole('button', { name: /until/i }).click();
    await expect(page.getByText(/pick an end date/i)).toBeVisible();
  });

  test('Date picker popover is NOT clipped by the Actions panel', async ({ page }) => {
    await page.getByRole('button', { name: /until/i }).click();
    await page.getByRole('button', { name: /pick an end date/i }).click();
    // The popover is portaled to <body>, so it should be a sibling of <main>.
    const pop = page.locator('.datepicker-pop, .fade-in-soft.bg-white').filter({ hasText: /S\s*M\s*T\s*W/ }).first();
    await expect(pop).toBeVisible();

    // Geometry check: popover must reach beyond the Actions panel's right edge,
    // OR at minimum extend more vertical space than the panel header allows.
    const popBox  = await pop.boundingBox();
    expect(popBox).not.toBeNull();
    expect(popBox!.height).toBeGreaterThan(180); // would be much smaller if clipped
  });

  test('Sidebar links navigate without 404 / error', async ({ page }) => {
    for (const label of ['Projects', 'Team', 'Settings']) {
      const link = page.getByRole('link', { name: new RegExp(`^${label}`, 'i') }).first();
      await link.click();
      await expect(page.locator('text=/404|not found|application error|internal server error/i'))
        .toHaveCount(0, { timeout: 5_000 });
      // Back to home for the next iteration
      await page.goto('/');
    }
  });
});
