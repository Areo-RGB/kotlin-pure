import { test, expect } from '@playwright/test';

test.describe('Navigation Flow', () => {
  test('should complete full navigation flow from landing to tools and back', async ({ page }) => {
    // Start at landing page
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('ScoreSync');
    
    // Navigate to tools
    await page.click('text=Tools');
    await expect(page).toHaveURL(/.*#\/tools/);
    await expect(page.locator('text=Available Tools')).toBeVisible();
    
    // Navigate to a tool (Motion Gate)
    await page.click('text=Motion Gate');
    await expect(page).toHaveURL(/.*#\/motion-gate/);
    
    // Navigate back to tools
    await page.goBack();
    await expect(page).toHaveURL(/.*#\/tools/);
  });

  test('should handle hash router navigation correctly', async ({ page }) => {
    await page.goto('/#/tools');
    await expect(page.locator('text=Available Tools')).toBeVisible();
    
    await page.goto('/#/body-pose');
    // BodyPose page should load (exact content depends on implementation)
    await expect(page).toHaveURL(/.*#\/body-pose/);
    
    await page.goto('/#/yoyo');
    await expect(page).toHaveURL(/.*#\/yoyo/);
  });

  test('should maintain state during navigation', async ({ page }) => {
    await page.goto('/');
    
    // Navigate through multiple pages
    await page.click('text=Tools');
    await expect(page).toHaveURL(/.*#\/tools/);
    
    await page.click('text=Motion Gate');
    await expect(page).toHaveURL(/.*#\/motion-gate/);
    
    // Use browser back
    await page.goBack();
    await expect(page).toHaveURL(/.*#\/tools/);
    
    await page.goBack();
    await expect(page).toHaveURL(/.*#\/$/);
  });
});






