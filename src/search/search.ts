import { BrowserManager } from '../browser/browser.js';
import { Config } from '../config/config.js';
import { withRetry } from '../retry/retry.js';
import { JSDOM } from 'jsdom';
import { extractResults } from './extract.js';

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

    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: this.config.timeout });

    // Wait for the structural result signal (an anchor wrapping an <h3>) rather
    // than a brittle, rotated class name like div.g / div.tF2Cxc. Resolves as
    // soon as the first result renders; non-fatal on timeout (we extract
    // whatever has rendered).
    await page
      .waitForFunction(
        () =>
          Array.from(document.querySelectorAll('a')).some(
            (a) => !!a.querySelector('h3') && !!a.getAttribute('href')
          ),
        { timeout: 8000 }
      )
      .catch(() => {
        // No results yet; fall through and extract whatever rendered.
      });

    // Brief settle so progressively-rendered sibling results are present before
    // we snapshot the DOM.
    await page.waitForTimeout(500);

    // Extract in Node (not in-page): grab the rendered HTML and parse it with
    // JSDOM, then run the pure, unit-tested extractor on the resulting document.
    // This mirrors src/reader/reader.ts, keeps a single source of truth for the
    // extraction logic, and avoids shipping JS into the page (which previously
    // also broke under transpilers that inject helpers like __name). It is also
    // far faster than the old per-element Playwright locator loop, which burned
    // the full default timeout on every non-result element.
    const html = await page.content();
    const dom = new JSDOM(html, { url: searchUrl });
    return extractResults(dom.window.document, numResults);
  }

  private buildSearchUrl(query: string, numResults: number): string {
    const encodedQuery = encodeURIComponent(query);
    const num = Math.min(10, numResults); // Google shows 10 per page
    return `https://www.google.com/search?q=${encodedQuery}&num=${num}`;
  }
}
