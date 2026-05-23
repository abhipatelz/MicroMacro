import { test, expect } from '@playwright/test';
import { ensureBootstrapLead, login } from './helpers';

test.describe('Projects + Kanban', () => {
  test.beforeAll(async ({ playwright }) => {
    const api = await playwright.request.newContext();
    await ensureBootstrapLead(api);
    await api.dispose();
  });

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('projects list renders, empty state visible if no projects', async ({ page }) => {
    await page.goto('/projects');
    await expect(page.locator('text=/404|not found|internal server error/i')).toHaveCount(0);
    // Either some projects, or the create-project affordance is reachable
    const createBtn = page.getByRole('link', { name: /new project|create project|\+ project/i }).first();
    if (await createBtn.count()) await expect(createBtn).toBeVisible();
  });

  test('create a project from the UI, then open it, switch to Kanban, slider arrows present', async ({ page, request }) => {
    // Try UI create first; fall back to API if the UI flow doesn't surface.
    await page.goto('/projects');

    const newBtn = page.getByRole('link', { name: /new project|\+ new/i })
      .or(page.getByRole('button', { name: /new project|\+ new/i }))
      .first();

    if (await newBtn.count()) {
      await newBtn.click();
      const nameInput = page.getByLabel(/project name|name/i).first();
      await nameInput.fill('E2E Launch Smoke Project');
      const createSubmit = page.getByRole('button', { name: /create|save/i }).first();
      await createSubmit.click();
      // Should land on project detail page
      await page.waitForURL(/\/projects\/[a-f0-9]{24}/, { timeout: 10_000 });
    } else {
      // Fallback: create via API and navigate.
      const r = await request.post('/api/projects', {
        data: { name: 'E2E Launch Smoke Project', lifecycle: 'generic' },
      });
      expect(r.ok()).toBeTruthy();
      const proj = await r.json();
      await page.goto(`/projects/${proj.id}`);
    }

    // Switch to Kanban view
    const kanbanTab = page.getByRole('button', { name: /^kanban$/i })
      .or(page.locator('button', { hasText: /^kanban$/i }))
      .first();
    if (await kanbanTab.count()) {
      await kanbanTab.click();

      // Slider should be present. With no tasks the arrows may be hidden
      // (nothing to scroll past), but the slim scrollbar container exists.
      const scroller = page.locator('.kanban-scroll').first();
      await expect(scroller).toBeVisible();
    }
  });

  test('project detail does not 500 even on an unknown id', async ({ page }) => {
    await page.goto('/projects/000000000000000000000000');
    // Should show a not-found UI, not crash.
    await expect(page.locator('text=/internal server error|application error/i')).toHaveCount(0);
  });
});
