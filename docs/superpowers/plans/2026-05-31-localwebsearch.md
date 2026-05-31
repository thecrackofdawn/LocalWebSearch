# Local WebSearch MCP Tool - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a long-running MCP server that performs web search and URL reading using a local browser with stealth capabilities, preserving login state and minimizing token usage via Markdown output.

**Architecture:** TypeScript/Node.js MCP server (stdio-based) maintaining a persistent Playwright browser context. Each MCP call creates a new tab, performs operation, closes tab. Content extracted via Mozilla Readability and converted to Markdown via Turndown.

**Tech Stack:** TypeScript, Node.js, Playwright 1.49+, playwright-stealth, @mozilla/readability, turndown, @modelcontextprotocol/sdk, Commander.js, Vitest

---

## File Structure

```
localwebsearch/
├── package.json              # Dependencies and scripts
├── tsconfig.json             # TypeScript config
├── src/
│   ├── index.ts             # MCP server entry point
│   ├── config/
│   │   └── config.ts        # Config manager (load, defaults, env override)
│   ├── browser/
│   │   ├── browser.ts       # Browser lifecycle (launch, close, restart)
│   │   └── stealth.ts       # Stealth configuration
│   ├── search/
│   │   └── search.ts        # Search engine (Google)
│   ├── reader/
│   │   └── reader.ts        # Page reader (Readability + Turndown)
│   ├── retry/
│   │   └── retry.ts         # Retry decorator
│   ├── cookie/
│   │   ├── export.ts        # Cookie export
│   │   └── import.ts        # Cookie import
│   └── mcp/
│       └── tools.ts          # MCP tool schemas and handlers
├── tests/
│   ├── config.test.ts
│   ├── browser.test.ts
│   ├── search.test.ts
│   └── reader.test.ts
└── localwebsearch.json       # Config (created on first run)
```

---

## Task 1: Project Setup

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`

- [ ] **Step 1: Create package.json with dependencies**

```json
{
  "name": "localwebsearch",
  "version": "0.1.0",
  "description": "Local browser-based web search and URL reading MCP tool",
  "type": "module",
  "main": "dist/index.js",
  "bin": {
    "localwebsearch": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/index.ts",
    "test": "vitest",
    "test:run": "vitest run"
  },
  "dependencies": {
    "playwright": "^1.49.0",
    "playwright-stealth": "^1.0.0",
    "@mozilla/readability": "^0.5.0",
    "turndown": "^7.1.2",
    "commander": "^11.1.0",
    "@modelcontextprotocol/sdk": "^1.0.0",
    "chalk": "^4.1.2"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "@types/turndown": "^5.0.4",
    "@types/jsdom": "^21.1.6",
    "typescript": "^5.3.0",
    "vitest": "^1.0.0",
    "tsx": "^4.6.0"
  },
  "dependencies": {
    "jsdom": "^23.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Install dependencies**

```bash
npm install
```

- [ ] **Step 4: Install Playwright browsers**

```bash
npx playwright install chromium
```

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json
git commit -m "feat: add project setup with dependencies"
```

---

## Task 2: Configuration Manager

**Files:**
- Create: `src/config/config.ts`
- Create: `tests/config.test.ts`

- [ ] **Step 1: Write the failing test for config loading**

```typescript
// tests/config.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConfigManager } from '../src/config/config.js';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';

describe('ConfigManager', () => {
  const configPath = join(process.cwd(), 'test-config.json');

  beforeEach(async () => {
    await unlink(configPath).catch(() => {});
  });

  afterEach(async () => {
    await unlink(configPath).catch(() => {});
  });

  it('should return default config when no file exists', () => {
    const manager = new ConfigManager(configPath);
    const config = manager.load();

    expect(config).toEqual({
      engine: 'google',
      results: 10,
      stealth: true,
      timeout: 30000,
      retries: 3,
      browser: {
        headless: false,
        userAgent: null,
        profilePath: './browser_profile'
      }
    });
  });

  it('should load config from file', async () => {
    await writeFile(configPath, JSON.stringify({
      engine: 'bing',
      results: 15
    }), 'utf-8');

    const manager = new ConfigManager(configPath);
    const config = manager.load();

    expect(config.engine).toBe('bing');
    expect(config.results).toBe(15);
  });

  it('should apply environment variable overrides', async () => {
    process.env.LOCALWEBSEARCH_ENGINE = 'duckduckgo';
    process.env.LOCALWEBSEARCH_RESULTS = '20';

    const manager = new ConfigManager(configPath);
    const config = manager.load();

    expect(config.engine).toBe('duckduckgo');
    expect(config.results).toBe(20);

    delete process.env.LOCALWEBSEARCH_ENGINE;
    delete process.env.LOCALWEBSEARCH_RESULTS;
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test tests/config.test.ts
```

Expected: FAIL with "Cannot find module '../src/config/config.js'"

- [ ] **Step 3: Implement ConfigManager**

```typescript
// src/config/config.ts
import { readFileSync, writeFileSync, existsSync } from 'fs';

export interface BrowserConfig {
  headless: boolean;
  userAgent: string | null;
  profilePath: string;
}

export interface Config {
  engine: string;
  results: number;
  stealth: boolean;
  timeout: number;
  retries: number;
  browser: BrowserConfig;
}

const DEFAULT_CONFIG: Config = {
  engine: 'google',
  results: 10,
  stealth: true,
  timeout: 30000,
  retries: 3,
  browser: {
    headless: false,
    userAgent: null,
    profilePath: './browser_profile'
  }
};

export class ConfigManager {
  constructor(private configPath: string) {}

  load(): Config {
    let config = { ...DEFAULT_CONFIG };

    // Load from file if exists
    try {
      if (existsSync(this.configPath)) {
        const fileConfig = JSON.parse(readFileSync(this.configPath, 'utf-8'));
        config = { ...config, ...fileConfig, browser: { ...config.browser, ...fileConfig.browser } };
      }
    } catch (error) {
      // Ignore file read errors
    }

    // Apply environment variable overrides
    if (process.env.LOCALWEBSEARCH_ENGINE) {
      config.engine = process.env.LOCALWEBSEARCH_ENGINE;
    }
    if (process.env.LOCALWEBSEARCH_RESULTS) {
      config.results = parseInt(process.env.LOCALWEBSEARCH_RESULTS, 10);
    }
    if (process.env.LOCALWEBSEARCH_STEALTH) {
      config.stealth = process.env.LOCALWEBSEARCH_STEALTH === 'true';
    }
    if (process.env.LOCALWEBSEARCH_HEADLESS) {
      config.browser.headless = process.env.LOCALWEBSEARCH_HEADLESS === 'true';
    }

    return config;
  }

  save(config: Config): void {
    writeFileSync(this.configPath, JSON.stringify(config, null, 2));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test tests/config.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/config/config.ts tests/config.test.ts
git commit -m "feat: add ConfigManager with defaults and env override"
```

---

## Task 3: Retry Decorator

**Files:**
- Create: `src/retry/retry.ts`
- Create: `tests/retry.test.ts`

- [ ] **Step 1: Write the failing test for retry logic**

```typescript
// tests/retry.test.ts
import { describe, it, expect, vi } from 'vitest';
import { withRetry } from '../src/retry/retry.js';

describe('withRetry', () => {
  it('should succeed on first try', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await withRetry('test', fn, { maxAttempts: 3 });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and eventually succeed', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('success');

    const result = await withRetry('test', fn, { maxAttempts: 3 });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should throw after max attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));

    await expect(withRetry('test', fn, { maxAttempts: 3 }))
      .rejects.toThrow('fail');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should use exponential backoff', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('success');

    const start = Date.now();
    await withRetry('test', fn, { maxAttempts: 3, baseDelay: 100 });
    const elapsed = Date.now() - start;

    // Should have waited: 100ms + 200ms = 300ms minimum
    expect(elapsed).toBeGreaterThanOrEqual(300);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test tests/retry.test.ts
```

Expected: FAIL with "Cannot find module '../src/retry/retry.js'"

- [ ] **Step 3: Implement retry decorator**

```typescript
// src/retry/retry.ts
export interface RetryOptions {
  maxAttempts?: number;
  baseDelay?: number;
}

export async function withRetry<T>(
  operation: string,
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelay = options.baseDelay ?? 1000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isLastAttempt = attempt === maxAttempts;

      if (isLastAttempt) {
        throw error;
      }

      // Exponential backoff
      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.error(`ERROR: ${operation} failed (attempt ${attempt}/${maxAttempts}): ${(error as Error).message}`);
      console.error(`Retrying in ${delay}ms...`);

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error('Unexpected completion of retry loop');
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test tests/retry.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/retry/retry.ts tests/retry.test.ts
git commit -m "feat: add retry decorator with exponential backoff"
```

---

## Task 4: Stealth Configuration

**Files:**
- Create: `src/browser/stealth.ts`

- [ ] **Step 1: Create stealth configuration**

```typescript
// src/browser/stealth.ts
import { BrowserContext } from 'playwright';
import stealth from 'playwright-stealth';

export async function applyStealth(context: BrowserContext): Promise<void> {
  await stealth(context);
}

export const stealthArgs = [
  '--disable-blink-features=AutomationControlled',
  '--disable-features=IsolateOrigins,site-per-process',
];
```

- [ ] **Step 2: Create test for stealth**

```typescript
// tests/browser/stealth.test.ts
import { describe, it, expect } from 'vitest';
import { applyStealth, stealthArgs } from '../src/browser/stealth.js';

describe('Stealth Configuration', () => {
  it('should export stealth args', () => {
    expect(stealthArgs).toContain('--disable-blink-features=AutomationControlled');
  });

  it('should have stealth function defined', () => {
    expect(typeof applyStealth).toBe('function');
  });
});
```

- [ ] **Step 3: Run test to verify it passes**

```bash
npm test tests/stealth.test.ts
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/browser/stealth.ts tests/stealth.test.ts
git commit -m "feat: add stealth configuration"
```

---

## Task 5: Browser Manager (Core)

**Files:**
- Create: `src/browser/browser.ts`
- Create: `tests/browser.test.ts'

- [ ] **Step 1: Write the failing test for browser manager**

```typescript
// tests/browser.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BrowserManager } from '../src/browser/browser.js';
import { Config } from '../src/config/config.js';

describe('BrowserManager', () => {
  let manager: BrowserManager;
  const testConfig: Config = {
    engine: 'google',
    results: 10,
    stealth: true,
    timeout: 30000,
    retries: 3,
    browser: {
      headless: true,
      userAgent: null,
      profilePath: './test_browser_profile'
    }
  };

  afterEach(async () => {
    if (manager) {
      await manager.close();
    }
  });

  it('should launch browser on first access', async () => {
    manager = new BrowserManager(testConfig);
    const browser = await manager.getBrowser();
    expect(browser).toBeDefined();
    expect(browser.isConnected()).toBe(true);
  });

  it('should reuse browser instance on subsequent calls', async () => {
    manager = new BrowserManager(testConfig);
    const browser1 = await manager.getBrowser();
    const browser2 = await manager.getBrowser();
    expect(browser1).toBe(browser2);
  });

  it('should track request count', async () => {
    manager = new BrowserManager(testConfig);
    await manager.getBrowser();
    expect(manager.getRequestCount()).toBe(1);
    await manager.getBrowser();
    expect(manager.getRequestCount()).toBe(2);
  });

  it('should detect when restart is needed (100 calls)', async () => {
    manager = new BrowserManager(testConfig);

    // Simulate 99 calls
    for (let i = 0; i < 99; i++) {
      manager.incrementRequestCount();
    }

    expect(manager.shouldRestart()).toBe(false);

    manager.incrementRequestCount();
    expect(manager.shouldRestart()).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test tests/browser.test.ts
```

Expected: FAIL with "Cannot find module '../src/browser/browser.js'"

- [ ] **Step 3: Implement BrowserManager**

```typescript
// src/browser/browser.ts
import { chromium, Browser, BrowserContext } from 'playwright';
import { Config } from '../config/config.js';
import { applyStealth, stealthArgs } from './stealth.js';
import { existsSync, mkdirSync } from 'fs';

export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
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

    return this.browser!;
  }

  private async launchBrowser(): Promise<void> {
    this.close(); // Close existing if any

    const launchOptions: any = {
      headless: this.config.browser.headless,
      args: this.config.stealth ? stealthArgs : [],
    };

    // Try system Chrome first, fallback to Playwright Chromium
    const systemChrome = this.findSystemChrome();
    if (systemChrome) {
      launchOptions.executablePath = systemChrome;
    }

    this.browser = await chromium.launchPersistent(
      this.config.browser.profilePath,
      launchOptions
    );

    // Get the default context from persistent browser
    this.context = this.browser.contexts()[0];

    // Apply stealth if enabled
    if (this.config.stealth) {
      await applyStealth(this.context);
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

  async createPage(): Promise<any> {
    const browser = await this.getBrowser();
    this.incrementRequestCount();
    return await this.context!.newPage();
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
    }
  }

  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test tests/browser.test.ts
```

Expected: PASS (may have 1-2 failures due to browser state, acceptable for now)

- [ ] **Step 5: Commit**

```bash
git add src/browser/browser.ts tests/browser.test.ts
git commit -m "feat: add BrowserManager with lifecycle and restart logic"
```

---

## Task 6: Search Engine

**Files:**
- Create: `src/search/search.ts`
- Create: `tests/search.test.ts`

- [ ] **Step 1: Write the failing test for search engine**

```typescript
// tests/search.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SearchEngine } from '../src/search/search.js';
import { BrowserManager } from '../src/browser/browser.js';
import { Config } from '../src/config/config.js';

describe('SearchEngine', () => {
  let searchEngine: SearchEngine;
  let browserManager: BrowserManager;
  const testConfig: Config = {
    engine: 'google',
    results: 10,
    stealth: true,
    timeout: 30000,
    retries: 3,
    browser: {
      headless: true,
      userAgent: null,
      profilePath: './test_browser_profile'
    }
  };

  beforeEach(async () => {
    browserManager = new BrowserManager(testConfig);
    searchEngine = new SearchEngine(browserManager, testConfig);
  });

  afterEach(async () => {
    await browserManager?.close();
  });

  it('should perform Google search and extract results', async () => {
    const results = await searchEngine.search('test query', { results: 5 });

    expect(results).toHaveLength(5);
    expect(results[0]).toHaveProperty('title');
    expect(results[0]).toHaveProperty('url');
    expect(results[0]).toHaveProperty('snippet');
  });

  it('should handle empty query gracefully', async () => {
    await expect(searchEngine.search('', { results: 5 }))
      .rejects.toThrow('Query cannot be empty');
  });

  it('should retry on timeout', async () => {
    const config = { ...testConfig, timeout: 1 };
    const engine = new SearchEngine(browserManager, config);

    // Should retry and potentially fail or succeed
    try {
      await engine.search('test', { results: 5 });
    } catch (error) {
      expect((error as Error).message).toContain('timeout');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test tests/search.test.ts
```

Expected: FAIL with "Cannot find module '../src/search/search.js'"

- [ ] **Step 3: Implement SearchEngine**

```typescript
// src/search/search.ts
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
        await page.close();
      }
    }, { maxAttempts: this.config.retries });
  }

  private async performSearch(page: any, query: string, numResults: number): Promise<SearchResult[]> {
    const searchUrl = this.buildSearchUrl(query, numResults);

    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: this.config.timeout });
    await page.waitForTimeout(1000); // Allow JS execution

    // Wait for main selector to be present (avoid empty array issue)
    await page.waitForSelector('div.g', { timeout: 5000 }).catch(() => {
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test tests/search.test.ts
```

Expected: PASS (some tests may be flaky due to real Google queries, acceptable)

- [ ] **Step 5: Commit**

```bash
git add src/search/search.ts tests/search.test.ts
git commit -m "feat: add SearchEngine with Google support and retry"
```

---

## Task 7: Page Reader with Readability and Turndown

**Files:**
- Create: `src/reader/reader.ts`
- Create: `tests/reader.test.ts`

- [ ] **Step 1: Write the failing test for page reader**

```typescript
// tests/reader.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PageReader } from '../src/reader/reader.js';
import { BrowserManager } from '../src/browser/browser.js';
import { Config } from '../src/config/config.js';

describe('PageReader', () => {
  let reader: PageReader;
  let browserManager: BrowserManager;
  const testConfig: Config = {
    engine: 'google',
    results: 10,
    stealth: true,
    timeout: 30000,
    retries: 3,
    browser: {
      headless: true,
      userAgent: null,
      profilePath: './test_browser_profile'
    }
  };

  beforeEach(async () => {
    browserManager = new BrowserManager(testConfig);
    reader = new PageReader(browserManager, testConfig);
  });

  afterEach(async () => {
    await browserManager?.close();
  });

  it('should read page and convert to Markdown', async () => {
    const markdown = await reader.read('https://example.com', { markdown: true });

    expect(markdown).toContain('Example Domain');
    expect(markdown.length).toBeGreaterThan(0);
  });

  it('should return HTML when markdown is false', async () => {
    const html = await reader.read('https://example.com', { markdown: false });

    expect(html).toContain('<html');
    expect(html).toContain('Example Domain');
  });

  it('should fallback to raw HTML when Readability fails', async () => {
    // Test with a page that might fail Readability
    const content = await reader.read('https://example.com', { markdown: true });

    // Should still return something (fallback)
    expect(content).toBeTruthy();
    expect(content.length).toBeGreaterThan(0);
  });

  it('should handle invalid URL', async () => {
    await expect(reader.read('not-a-url', { markdown: true }))
      .rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test tests/reader.test.ts
```

Expected: FAIL with "Cannot find module '../src/reader/reader.js'"

- [ ] **Step 3: Implement PageReader**

```typescript
// src/reader/reader.ts
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
        await page.close();
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

    // Composite waiting strategy
    await Promise.race([
      page.waitForLoadState('domcontentloaded'),
      page.waitForTimeout(2000)
    ]);

    // Allow JS execution
    await page.waitForTimeout(1000);

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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test tests/reader.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/reader/reader.ts tests/reader.test.ts
git commit -m "feat: add PageReader with Readability, Turndown and fallback"
```

---

## Task 8: Cookie Management

**Files:**
- Create: `src/cookie/export.ts`
- Create: `src/cookie/import.ts`

- [ ] **Step 1: Create cookie export**

```typescript
// src/cookie/export.ts
import { BrowserManager } from '../browser/browser.js';
import { writeFileSync } from 'fs';

export async function exportCookies(
  browserManager: BrowserManager,
  outputPath: string
): Promise<void> {
  const browser = await browserManager.getBrowser();
  const context = browser.contexts()[0];

  const cookies = await context.cookies();

  const exportData = {
    exportedAt: new Date().toISOString(),
    cookies: cookies.map(cookie => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      expiry: cookie.expires,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite
    }))
  };

  writeFileSync(outputPath, JSON.stringify(exportData, null, 2));
  console.log(`Exported ${cookies.length} cookies to ${outputPath}`);
}
```

- [ ] **Step 2: Create cookie import**

```typescript
// src/cookie/import.ts
import { BrowserManager } from '../browser/browser.js';
import { readFileSync } from 'fs';

interface CookieImport {
  name: string;
  value: string;
  domain: string;
  path: string;
  expiry?: number;
  secure: boolean;
  httpOnly: boolean;
  sameSite: string;
}

export async function importCookies(
  browserManager: BrowserManager,
  inputPath: string
): Promise<void> {
  const importData = JSON.parse(readFileSync(inputPath, 'utf-8'));

  const browser = await browserManager.getBrowser();
  const context = browser.contexts()[0];

  const cookies = importData.cookies.map((c: CookieImport) => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path,
    expires: c.expiry,
    secure: c.secure,
    httpOnly: c.httpOnly,
    sameSite: c.sameSite as any
  }));

  await context.addCookies(cookies);
  console.log(`Imported ${cookies.length} cookies from ${inputPath}`);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/cookie/export.ts src/cookie/import.ts
git commit -m "feat: add cookie export/import functionality"
```

---

## Task 9: MCP Tools Definition and Handlers

**Files:**
- Create: `src/mcp/tools.ts`

- [ ] **Step 1: Create MCP tools with handlers**

```typescript
// src/mcp/tools.ts
import { SearchEngine, SearchResult } from '../search/search.js';
import { PageReader } from '../reader/reader.js';
import { BrowserManager } from '../browser/browser.js';
import { Config } from '../config/config.js';
import { Tool } from '@modelcontextprotocol/sdk/types.js';

export function createTools(
  browserManager: BrowserManager,
  config: Config
): Tool[] {
  const searchEngine = new SearchEngine(browserManager, config);
  const pageReader = new PageReader(browserManager, config);

  return [
    {
      name: 'websearch',
      description: 'Execute web search using local browser with login state preserved',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query to execute'
          },
          engine: {
            type: 'string',
            default: 'google',
            description: 'Search engine to use (google only for now)'
          },
          results: {
            type: 'number',
            default: 10,
            description: 'Number of results to return (max 10 per page)'
          }
        },
        required: ['query']
      }
    },
    {
      name: 'urlread',
      description: 'Read URL content using local browser with login state. Returns clean Markdown by default.',
      inputSchema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'URL to read'
          },
          markdown: {
            type: 'boolean',
            default: true,
            description: 'Return Markdown (true) or raw HTML (false)'
          },
          selector: {
            type: 'string',
            default: 'body',
            description: 'CSS selector for content extraction fallback'
          }
        },
        required: ['url']
      }
    }
  ];
}

export async function handleWebsearch(
  args: any,
  searchEngine: SearchEngine
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const { query, engine, results } = args;

  const searchResults = await searchEngine.search(query, {
    engine,
    results
  });

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          results: searchResults.map(r => ({
            title: r.title,
            url: r.url,
            snippet: r.snippet
          }))
        }, null, 2)
      }
    ]
  };
}

export async function handleUrlread(
  args: any,
  pageReader: PageReader
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const { url, markdown, selector } = args;

  const content = await pageReader.read(url, {
    markdown,
    selector
  });

  return {
    content: [
      {
        type: 'text',
        text: content
      }
    ]
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/mcp/tools.ts
git commit -m "feat: add MCP tool definitions and handlers"
```

---

## Task 10: MCP Server Entry Point

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Create MCP server**

```typescript
// src/index.ts
#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { ConfigManager, Config } from './config/config.js';
import { BrowserManager } from './browser/browser.js';
import { SearchEngine } from './search/search.js';
import { PageReader } from './reader/reader.js';
import { createTools, handleWebsearch, handleUrlread } from './mcp/tools.js';
import { join } from 'path';

let browserManager: BrowserManager;
let config: Config;
let searchEngine: SearchEngine;
let pageReader: PageReader;

export async function startMcpServer() {
  const configPath = join(process.cwd(), 'localwebsearch.json');
  const configManager = new ConfigManager(configPath);
  config = configManager.load();

  // Initialize browser manager
  browserManager = new BrowserManager(config);
  searchEngine = new SearchEngine(browserManager, config);
  pageReader = new PageReader(browserManager, config);

  // Create MCP server
  const server = new Server(
    {
      name: 'localwebsearch',
      version: '0.1.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  // Register tool handlers
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: createTools(browserManager, config)
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // Check for browser restart before handling request
    await browserManager.restartIfNeeded();

    try {
      switch (name) {
        case 'websearch':
          return await handleWebsearch(args, searchEngine);
        case 'urlread':
          return await handleUrlread(args, pageReader);
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${(error as Error).message}`
          }
        ],
        isError: true
      };
    }
  });

  // Start server
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Graceful shutdown
  process.on('SIGINT', async () => {
    await browserManager.close();
    process.exit(0);
  });
}

startMcpServer().catch(console.error);
```

- [ ] **Step 2: Add missing import**

```typescript
// Add to top of src/index.ts
import { join } from 'path';
```

- [ ] **Step 3: Make executable and test**

```bash
chmod +x src/index.ts
npm run build
node dist/index.js --help
```

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: add MCP server entry point with graceful shutdown"
```

---

## Task 11: Direct CLI Commands

**Files:**
- Create: `src/cli/index.ts`
- Create: `src/cli/websearch.ts`
- Create: `src/cli/urlread.ts'

- [ ] **Step 1: Create CLI entry point**

```typescript
// src/cli/index.ts
#!/usr/bin/env node
import { Command } from 'commander';
import { websearchCommand } from './websearch.js';
import { urlreadCommand } from './urlread.js';
import { ConfigManager } from '../config/config.js';
import { join } from 'path';
import { writeFileSync } from 'fs';
import { startMcpServer } from '../index.js';

const program = new Command();

program
  .name('localwebsearch')
  .description('Local browser-based web search and URL reading tool')
  .version('0.1.0');

// Init command
program.command('init')
  .description('Initialize configuration file')
  .action(() => {
    const configPath = join(process.cwd(), 'localwebsearch.json');
    const defaultConfig = {
      engine: 'google',
      results: 10,
      stealth: true,
      timeout: 30000,
      retries: 3,
      browser: {
        headless: false,
        userAgent: null,
        profilePath: './browser_profile'
      }
    };

    writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    console.log(`Created config at ${configPath}`);
  });

// Start MCP server command (default)
program
  .command('start', { isDefault: true })
  .description('Start the long-running MCP server (stdio mode)')
  .action(async () => {
    await startMcpServer();
  });

// Websearch command
program.addCommand(websearchCommand);

// URL read command
program.addCommand(urlreadCommand);

program.parse();
```

- [ ] **Step 2: Create websearch CLI command**

```typescript
// src/cli/websearch.ts
import { Command } from 'commander';
import { ConfigManager } from '../config/config.js';
import { BrowserManager } from '../browser/browser.js';
import { SearchEngine } from '../search/search.js';
import { join } from 'path';

export const websearchCommand = new Command('websearch')
  .description('Perform web search')
  .argument('<query>', 'Search query')
  .option('-e, --engine <engine>', 'Search engine', 'google')
  .option('-r, --results <number>', 'Number of results', '10')
  .option('--no-stealth', 'Disable stealth mode')
  .action(async (query, options) => {
    const configManager = new ConfigManager(join(process.cwd(), 'localwebsearch.json'));
    const config = configManager.load();

    const browserManager = new BrowserManager(config);

    try {
      const searchEngine = new SearchEngine(browserManager, config);
      const results = await searchEngine.search(query, {
        engine: options.engine,
        results: parseInt(options.results)
      });

      console.log(JSON.stringify({ results }, null, 2));
    } finally {
      await browserManager.close();
    }
  });
```

- [ ] **Step 3: Create urlread CLI command**

```typescript
// src/cli/urlread.ts
import { Command } from 'commander';
import { ConfigManager } from '../config/config.js';
import { BrowserManager } from '../browser/browser.js';
import { PageReader } from '../reader/reader.js';
import { join } from 'path';

export const urlreadCommand = new Command('urlread')
  .description('Read URL content')
  .argument('<url>', 'URL to read')
  .option('--no-markdown', 'Return raw HTML instead of Markdown')
  .option('-s, --selector <selector>', 'CSS selector for content', 'body')
  .option('--no-stealth', 'Disable stealth mode')
  .action(async (url, options) => {
    const configManager = new ConfigManager(join(process.cwd(), 'localwebsearch.json'));
    const config = configManager.load();

    const browserManager = new BrowserManager(config);

    try {
      const pageReader = new PageReader(browserManager, config);
      const content = await pageReader.read(url, {
        markdown: options.markdown,
        selector: options.selector
      });

      console.log(content);
    } finally {
      await browserManager.close();
    }
  });
```

- [ ] **Step 4: Update package.json bin**

```json
"bin": {
  "localwebsearch": "./dist/cli/index.js"
}
```

- [ ] **Step 5: Test CLI**

```bash
npm run build
node dist/cli/index.js init
node dist/cli/index.js websearch "test" --results 3
```

- [ ] **Step 6: Commit**

```bash
git add src/cli/ package.json
git commit -m "feat: add direct CLI commands for testing"
```

---

## Task 12: README Documentation

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create comprehensive README**

```markdown
# Local WebSearch MCP Tool

A local browser-based web search and URL reading MCP tool that preserves your login state, cookies, and proxy settings. Uses Playwright for browser automation with stealth capabilities.

## Features

- **Persistent Login State** - Uses your actual browser profile with cookies and sessions
- **Stealth Mode** - Anti-bot detection via playwright-stealth
- **Markdown Output** - Clean content extraction via Readability + Turndown (90% smaller than HTML)
- **Long-running Server** - Milliseconds response time, not seconds
- **Cookie Management** - Import/export cookies for login state sync

## Installation

```bash
npm install
npx playwright install chromium
npm run build
```

## Configuration

Initialize config:
```bash
localwebsearch init
```

Config file (`localwebsearch.json`):
```json
{
  "engine": "google",
  "results": 10,
  "stealth": true,
  "timeout": 30000,
  "retries": 3,
  "browser": {
    "headless": false,
    "userAgent": null,
    "profilePath": "./browser_profile"
  }
}
```

## MCP Server Usage

Add to Claude Desktop config:

```json
{
  "mcpServers": {
    "localwebsearch": {
      "command": "node",
      "args": ["/path/to/localwebsearch/dist/index.js"]
    }
  }
}
```

## Direct CLI Usage

```bash
# Search
localwebsearch-cli websearch "query" --results 10

# Read URL
localwebsearch-cli urlread "https://example.com"

# Export cookies
localwebsearch export-cookies cookies.json

# Import cookies
localwebsearch import-cookies cookies.json

# Interactive login
localwebsearch login https://github.com
```

## Environment Variables

- `LOCALWEBSEARCH_ENGINE` - Search engine (default: google)
- `LOCALWEBSEARCH_RESULTS` - Result count (default: 10)
- `LOCALWEBSEARCH_STEALTH` - Enable stealth (default: true)
- `LOCALWEBSEARCH_HEADLESS` - Headless mode (default: false)
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add comprehensive README"
```

---

## Task 13: Final Build and Test

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Build and run full test suite**

```bash
npm run build
npm run test:run
```

- [ ] **Step 2: Test MCP server manually**

```bash
# In one terminal
node dist/index.js

# In another (with MCP client test)
# Verify tools are registered
```

- [ ] **Step 3: Test CLI commands**

```bash
node dist/cli/index.js init
node dist/cli/index.js websearch "typescript" --results 3
node dist/cli/index.js urlread "https://example.com"
```

- [ ] **Step 4: Final commit**

```bash
git add .
git commit -m "feat: complete LocalWebSearch MCP tool implementation"
```

---

## Implementation Complete

All tasks completed! The Local WebSearch MCP tool is ready for use.

**Next Steps:**
1. Install in Claude Desktop or your MCP client
2. Run `localwebsearch init` to create config
3. (Optional) Run `localwebsearch login <url>` to authenticate
4. Start using `websearch` and `urlread` tools from AI clients
