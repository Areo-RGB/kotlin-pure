# Playwright Tests

This directory contains end-to-end tests for the ScoreSync Tools application using Playwright.

## Test Structure

- `landing.spec.ts` - Tests for the landing page
- `tools.spec.ts` - Tests for the tools page and navigation
- `navigation.spec.ts` - Tests for navigation flows
- `accessibility.spec.ts` - Accessibility and keyboard navigation tests
- `responsive.spec.ts` - Responsive design tests

## Running Tests

### Run all tests
```bash
pnpm test
```

### Run tests in UI mode (interactive)
```bash
pnpm test:ui
```

### Run tests in headed mode (see browser)
```bash
pnpm test:headed
```

### Debug tests
```bash
pnpm test:debug
```

### Run specific test file
```bash
npx playwright test tests/landing.spec.ts
```

### Run tests in specific browser
```bash
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit
```

## Test Coverage

### Landing Page Tests
- ✅ Title and subtitle display
- ✅ Navigation to tools page

### Tools Page Tests
- ✅ All tool cards are visible
- ✅ Navigation to each tool
- ✅ Back button functionality

### Navigation Tests
- ✅ Full navigation flow
- ✅ Hash router navigation
- ✅ Browser back/forward navigation

### Accessibility Tests
- ✅ Heading structure
- ✅ Keyboard navigation
- ✅ ARIA labels

### Responsive Tests
- ✅ Mobile viewport (375x667)
- ✅ Tablet viewport (768x1024)
- ✅ Desktop viewport (1920x1080)

## Configuration

Tests are configured in `playwright.config.ts`:
- Base URL: `http://localhost:5173`
- Automatically starts dev server before tests
- Runs on Chromium, Firefox, and WebKit
- Generates HTML reports on failure

## Viewing Test Reports

After running tests, view the HTML report:
```bash
npx playwright show-report
```

## Writing New Tests

1. Create a new test file in the `tests/` directory
2. Import `test` and `expect` from `@playwright/test`
3. Use descriptive test names
4. Follow the existing test structure

Example:
```typescript
import { test, expect } from '@playwright/test';

test('should do something', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toBeVisible();
});
```






