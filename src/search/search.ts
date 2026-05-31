import { BrowserManager } from '../browser/browser.js';
import { Config } from '../config/config.js';
import { withRetry } from '../retry/retry.js';

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchOptions {
  engine?: string;
  results?: number;
}

export class SearchEngine {
  constructor(
    private browserManager: BrowserManager,
    private config: Config
  ) {}

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    if (!query || query.trim().length === 0) {
      throw new Error('Query cannot be empty');
    }

    const engine = options.engine ?? this.config.engine;
    const numResults = options.results ?? this.config.results;

    return withRetry('websearch', async () => {
      const page = await this.browserManager.createPage();

      try {
        return await this.performSearch(page, query, numResults);
      } finally {
        await this.browserManager.releasePage(page);
      }
    }, { maxAttempts: this.config.retries });
  }

  private async performSearch(page: any, query: string, numResults: number): Promise<SearchResult[]> {
    const searchUrl = this.buildSearchUrl(query, numResults);

    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(500); // Brief pause for JS execution

    // Wait for main selector to be present (avoid empty array issue)
    await page.waitForSelector('div.g', { timeout: 3000 }).catch(() => {
      // Ignore if primary selector not found, will try alternatives
    });

    // Multiple selector strategies for robustness
    const selectors = [
      'div.g',           // Standard Google results
      'div[data-hveid]', // Alternative structure
      'div.tF2Cxc',      // Mobile/responsive
    ];

    let results: SearchResult[] = [];

    for (const selector of selectors) {
      try {
        const elements = await page.locator(selector).all();

        if (elements.length > 0) {
          for (const element of elements.slice(0, numResults)) {
            try {
              const titleEl = element.locator('h3').first();
              const linkEl = element.locator('a').first();
              const snippetEl = element.locator('div[style*="-webkit-line-clamp"]').first();

              const title = await titleEl.textContent() || '';
              const url = await linkEl.getAttribute('href') || '';
              const snippet = await snippetEl.textContent() || '';

              if (title && url) {
                results.push({ title, url, snippet: snippet || '' });
              }
            } catch (e) {
              // Skip malformed results
              continue;
            }
          }

          if (results.length >= numResults) {
            break;
          }
        }
      } catch (e) {
        // Try next selector
        continue;
      }
    }

    return results.slice(0, numResults);
  }

  private buildSearchUrl(query: string, numResults: number): string {
    const encodedQuery = encodeURIComponent(query);
    const num = Math.min(10, numResults); // Google shows 10 per page
    return `https://www.google.com/search?q=${encodedQuery}&num=${num}`;
  }
}
