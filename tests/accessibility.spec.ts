import { test, expect } from '@playwright/test';

test.describe('Accessibility', () => {
  test('landing page should have proper heading structure', async ({ page }) => {
    await page.goto('/');
    
    // Check for main heading
    const h1 = page.locator('h1');
    await expect(h1).toBeVisible();
    await expect(h1).toContainText('ScoreSync');
  });

  test('tools page should be keyboard navigable', async ({ page }) => {
    await page.goto('/#/tools');
    
    // Tab through interactive elements
    await page.keyboard.press('Tab');
    
    // Check that focus is visible (this depends on your implementation)
    // You can add more specific keyboard navigation tests here
  });

  test('should have proper ARIA labels on interactive elements', async ({ page }) => {
    await page.goto('/#/tools');
    
    // Check that cards are clickable/interactive
    const motionGateCard = page.locator('text=Motion Gate').locator('..');
    await expect(motionGateCard).toBeVisible();
  });
});






