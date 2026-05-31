import { BrowserContext } from 'playwright';

export async function applyStealth(
  context: BrowserContext,
  userAgent?: string
): Promise<void> {
  // Custom stealth techniques since playwright-stealth is incompatible with Playwright 1.49+
  // Based on https://github.com/berstend/puppeteer-extra/issues/454

  await context.addInitScript((ua: string | undefined) => {
    // Remove navigator.webdriver flag
    Object.defineProperty(navigator, 'webdriver', {
      get: () => false,
    });

    // Mock navigator.plugins
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });

    // Mock navigator.languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
    });

    // Mask navigator.userAgent to match the HTTP header. Without this (and the
    // context-level userAgent) the default "HeadlessChrome" string leaks and
    // Google serves its /sorry/ captcha page, returning zero search results.
    if (ua) {
      Object.defineProperty(navigator, 'userAgent', {
        get: () => ua,
      });
    }
  }, userAgent);
}

export const stealthArgs = [
  '--disable-blink-features=AutomationControlled',
  '--disable-features=IsolateOrigins,site-per-process',
];
