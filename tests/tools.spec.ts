import { test, expect } from '@playwright/test';

test.describe('Tools Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#/tools');
  });

  test('should display all available tools', async ({ page }) => {
    // Check header
    await expect(page.locator('text=Available Tools')).toBeVisible();
    
    // Check all tool cards are visible
    await expect(page.locator('text=Motion Gate')).toBeVisible();
    await expect(page.locator('text=Optical Tripwire & Timing Systems')).toBeVisible();
    
    await expect(page.locator('text=BodyPose')).toBeVisible();
    await expect(page.locator('text=Real-time Skeletal Tracking')).toBeVisible();
    
    await expect(page.locator('text=Yo-Yo IR1')).toBeVisible();
    await expect(page.locator('text=Intermittent Recovery Test')).toBeVisible();
    
    await expect(page.locator('text=Sprint Duels')).toBeVisible();
    await expect(page.locator('text=Duel Randomizer')).toBeVisible();
    
    await expect(page.locator('text=Life Pool')).toBeVisible();
    await expect(page.locator('text=Motion-activated Time Bank')).toBeVisible();
    
    await expect(page.locator('text=Motion Counter')).toBeVisible();
    await expect(page.locator('text=Camera-based Rep Counter')).toBeVisible();
  });

  test('should navigate to Motion Gate when clicking Motion Gate card', async ({ page }) => {
    await page.click('text=Motion Gate');
    await expect(page).toHaveURL(/.*#\/motion-gate/);
  });

  test('should navigate to BodyPose when clicking BodyPose card', async ({ page }) => {
    await page.click('text=BodyPose');
    await expect(page).toHaveURL(/.*#\/body-pose/);
  });

  test('should navigate to Yo-Yo IR1 when clicking Yo-Yo IR1 card', async ({ page }) => {
    await page.click('text=Yo-Yo IR1');
    await expect(page).toHaveURL(/.*#\/yoyo/);
  });

  test('should navigate to Sprint Duels when clicking Sprint Duels card', async ({ page }) => {
    await page.click('text=Sprint Duels');
    await expect(page).toHaveURL(/.*#\/sprint-duels/);
  });

  test('should navigate to Life Pool when clicking Life Pool card', async ({ page }) => {
    await page.click('text=Life Pool');
    await expect(page).toHaveURL(/.*#\/life-pool/);
  });

  test('should navigate to Motion Counter when clicking Motion Counter card', async ({ page }) => {
    await page.click('text=Motion Counter');
    await expect(page).toHaveURL(/.*#\/motion-counter/);
  });

  test('should navigate back to landing page when clicking back button', async ({ page }) => {
    await page.click('button[aria-label="Back"], button:has-text("Back"), [role="button"]:has-text("Back")');
    await expect(page).toHaveURL(/.*#\/$/);
  });
});






