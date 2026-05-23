import { test, expect } from '@playwright/test';
import { ensureBootstrapLead, login } from './helpers';

test.describe('Teams page', () => {
  test.beforeAll(async ({ playwright }) => {
    const api = await playwright.request.newContext();
    await ensureBootstrapLead(api);
    await api.dispose();
  });

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('teams page renders without error', async ({ page }) => {
    await page.goto('/teams');
    await expect(page.locator('text=/internal server error|application error/i')).toHaveCount(0);
  });

  test('membership-as-tagging helper is visible on a team detail page (if any team exists)', async ({ page, request }) => {
    // Make sure at least one team exists so we have a detail page to visit.
    const list = await request.get('/api/teams');
    let teams: any[] = await list.json().catch(() => []);
    if (!Array.isArray(teams) || teams.length === 0) {
      const r = await request.post('/api/teams', {
        data: { name: 'E2E Smoke Team', function: 'QA', description: 'created by playwright' },
      });
      if (r.ok()) {
        const created = await r.json();
        teams = [created];
      } else {
        test.skip(true, 'team creation API not available in this build');
        return;
      }
    }
    const first = teams[0];
    await page.goto(`/teams/${first.id || first._id}`);
    await expect(page.getByText(/membership is the tag|members of this team see/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /\+ add member/i })).toBeVisible();
  });
});
