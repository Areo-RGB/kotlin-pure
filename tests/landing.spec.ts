import { test, expect } from '@playwright/test';

test.describe('Landing Page', () => {
  test('should display landing page with title and navigation', async ({ page }) => {
    await page.goto('/');
    
    // Check for main title
    await expect(page.locator('h1')).toContainText('ScoreSync');
    
    // Check for subtitle
    await expect(page.locator('text=Professional Session Management')).toBeVisible();
    
    // Check for Tools card
    await expect(page.locator('text=Tools')).toBeVisible();
    await expect(page.locator('text=Access suite of utilities')).toBeVisible();
  });

  test('should navigate to tools page when clicking Tools card', async ({ page }) => {
    await page.goto('/');
    
    // Click on Tools card
    await page.click('text=Tools');
    
    // Should navigate to /tools (hash router)
    await expect(page).toHaveURL(/.*#\/tools/);
    
    // Check for tools page header
    await expect(page.locator('text=Available Tools')).toBeVisible();
  });
});






