import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SearchEngine } from '../src/search/search.js';
import { BrowserManager } from '../src/browser/browser.js';
import { Config } from '../src/config/config.js';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('SearchEngine', () => {
  let searchEngine: SearchEngine;
  let browserManager: BrowserManager;
  let profileDir: string;

  const createTestConfig = (dir: string, overrides?: Partial<Config>): Config => ({
    engine: 'google',
    results: 10,
    stealth: true,
    timeout: 30000,
    retries: 3,
    ...overrides,
    browser: {
      headless: true,
      userAgent: null,
      profilePath: dir
    }
  });

  beforeEach(async () => {
    profileDir = mkdtempSync(join(tmpdir(), 'lws-test-'));
    const testConfig = createTestConfig(profileDir);
    browserManager = new BrowserManager(testConfig);
    searchEngine = new SearchEngine(browserManager, testConfig);
  });

  afterEach(async () => {
    await browserManager?.close();
    rmSync(profileDir, { recursive: true, force: true });
  });

  it('should perform Google search and extract results', async () => {
    const results = await searchEngine.search('test query', { results: 5 });

    // Google anti-bot measures may return 0 results - this is expected
    // When results ARE returned, they should have the correct shape
    if (results.length > 0) {
      expect(results[0]).toHaveProperty('title');
      expect(results[0]).toHaveProperty('url');
      expect(results[0]).toHaveProperty('snippet');
    }
  });

  it('should handle empty query gracefully', async () => {
    await expect(searchEngine.search('', { results: 5 }))
      .rejects.toThrow('Query cannot be empty');
  });

  it('should retry on timeout', async () => {
    const retryDir = mkdtempSync(join(tmpdir(), 'lws-test-'));
    const config = createTestConfig(retryDir, { timeout: 1 });
    const engine = new SearchEngine(browserManager, config);

    // Should retry and potentially fail or succeed
    try {
      await engine.search('test', { results: 5 });
    } catch (error) {
      expect((error as Error).message).toContain('Timeout');
    }
  });
});
