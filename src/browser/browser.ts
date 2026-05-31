import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { Config } from '../config/config.js';
import { applyStealth, stealthArgs } from './stealth.js';
import { existsSync, mkdirSync } from 'fs';

export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private reusablePage: Page | null = null;
  private requestCount: number = 0;
  private lastActivity: number = Date.now();

  constructor(private config: Config) {
    this.ensureProfileDir();
  }

  private ensureProfileDir(): void {
    const profilePath = this.config.browser.profilePath;
    if (!existsSync(profilePath)) {
      mkdirSync(profilePath, { recursive: true });
    }
  }

  async getBrowser(): Promise<Browser> {
    this.lastActivity = Date.now();

    if (!this.browser || !this.browser.isConnected()) {
      await this.launchBrowser();
    }

    this.incrementRequestCount();
    return this.browser!;
  }

  private async launchBrowser(): Promise<void> {
    await this.close(); // Close existing if any

    const launchOptions: any = {
      headless: this.config.browser.headless,
      args: this.config.stealth ? stealthArgs : [],
      channel: 'chrome', // Use Chrome channel for system Chrome
    };

    // Try system Chrome first, fallback to Playwright Chromium
    const systemChrome = this.findSystemChrome();
    if (systemChrome) {
      launchOptions.executablePath = systemChrome;
    } else {
      // Remove channel if using Playwright Chromium
      delete launchOptions.channel;
    }

    // Launch persistent context directly
    this.context = await chromium.launchPersistentContext(
      this.config.browser.profilePath,
      launchOptions
    );

    // Get the browser from the context
    this.browser = this.context.browser();

    // Apply stealth if enabled
    if (this.config.stealth) {
      await applyStealth(this.context);
    }

    // Reuse the default page created by persistent context
    const pages = this.context.pages();
    if (pages.length > 0) {
      this.reusablePage = pages[0];
    }

    this.requestCount = 0;
  }

  private findSystemChrome(): string | null {
    const paths: Record<string, string> = {
      win32: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      linux: '/usr/bin/google-chrome'
    };

    const platform = process.platform;
    const chromePath = paths[platform];

    if (chromePath && existsSync(chromePath)) {
      return chromePath;
    }

    return null;
  }

  async createPage(): Promise<Page> {
    const browser = await this.getBrowser();
    // getBrowser() already increments request count

    // Reuse existing page if available and not in use
    if (this.reusablePage && !this.reusablePage.isClosed()) {
      const page = this.reusablePage;
      this.reusablePage = null; // Mark as in-use
      return page;
    }

    // Fallback: create new page if reusable one is occupied or closed
    return await this.context!.newPage();
  }

  /**
   * Release a page back to the pool for reuse.
   * Navigates to about:blank instead of closing, avoiding blank tab proliferation.
   */
  async releasePage(page: Page): Promise<void> {
    try {
      if (!page.isClosed()) {
        await page.goto('about:blank').catch(() => {});
        this.reusablePage = page;
      }
    } catch {
      // If release fails, just null out - a new page will be created next time
      this.reusablePage = null;
    }
  }

  incrementRequestCount(): void {
    this.requestCount++;
  }

  getRequestCount(): number {
    return this.requestCount;
  }

  shouldRestart(): boolean {
    return this.requestCount >= 100;
  }

  getIdleTime(): number {
    return Date.now() - this.lastActivity;
  }

  shouldRestartIdle(): boolean {
    return this.getIdleTime() >= 3600000; // 1 hour
  }

  async restartIfNeeded(): Promise<void> {
    if (this.shouldRestart() || this.shouldRestartIdle()) {
      await this.close();
      await this.launchBrowser();

      // Verify browser successfully relaunched
      if (!this.browser || !this.browser.isConnected()) {
        throw new Error('Browser failed to restart after close');
      }
    }
  }

  async close(): Promise<void> {
    this.reusablePage = null;
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    // When using launchPersistentContext, closing the context automatically closes the browser
    // No need to call browser.close() separately
    this.browser = null;
  }
}
