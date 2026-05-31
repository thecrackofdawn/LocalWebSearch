import { BrowserManager } from '../browser/browser.js';
import { Config } from '../config/config.js';
import { withRetry } from '../retry/retry.js';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import { JSDOM } from 'jsdom';

export interface ReaderOptions {
  markdown?: boolean;
  selector?: string;
}

export class PageReader {
  private turndown: TurndownService;

  constructor(
    private browserManager: BrowserManager,
    private config: Config
  ) {
    this.turndown = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced'
    });
  }

  async read(url: string, options: ReaderOptions = {}): Promise<string> {
    const useMarkdown = options.markdown !== false;

    return withRetry('urlread', async () => {
      const page = await this.browserManager.createPage();

      try {
        return await this.performRead(page, url, useMarkdown, options.selector);
      } finally {
        await this.browserManager.releasePage(page);
      }
    }, { maxAttempts: this.config.retries });
  }

  private async performRead(
    page: any,
    url: string,
    useMarkdown: boolean,
    selector?: string
  ): Promise<string> {
    // Validate URL
    new URL(url); // Throws if invalid

    // Navigate to page with explicit timeout
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

    // Composite waiting strategy - race DOM ready against short timeout
    await Promise.race([
      page.waitForLoadState('domcontentloaded'),
      page.waitForTimeout(1000)
    ]);

    // Brief pause for JS execution
    await page.waitForTimeout(500);

    // Get page content
    let contentToConvert = '';

    if (useMarkdown) {
      // Try Readability first
      try {
        const pageContent = await page.content();
        const dom = new JSDOM(pageContent, { url });
        const article = new Readability(dom.window.document).parse();

        if (article && article.content) {
          contentToConvert = article.content;
        } else {
          // Fallback: Use body or selector
          contentToConvert = await page.innerHTML(selector || 'body');
        }
      } catch (e) {
        // Fallback on any error
        contentToConvert = await page.innerHTML(selector || 'body');
      }

      return this.turndown.turndown(contentToConvert);
    } else {
      // Return raw HTML
      return await page.innerHTML(selector || 'body');
    }
  }
}
