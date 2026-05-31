import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PageReader } from '../src/reader/reader.js';
import { BrowserManager } from '../src/browser/browser.js';
import { Config } from '../src/config/config.js';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('PageReader', () => {
  let profileDir: string;

  const getTestConfig = (dir: string): Config => ({
    engine: 'google',
    results: 10,
    stealth: true,
    timeout: 30000,
    retries: 1, // Reduce retries for faster test failure feedback
    browser: {
      headless: true,
      userAgent: null,
      profilePath: dir
    }
  });

  afterEach(() => {
    rmSync(profileDir, { recursive: true, force: true });
  });

  it('should read page and convert to Markdown', async () => {
    profileDir = mkdtempSync(join(tmpdir(), 'lws-test-'));
    const testConfig = getTestConfig(profileDir);
    const browserManager = new BrowserManager(testConfig);
    const reader = new PageReader(browserManager, testConfig);

    try {
      const markdown = await reader.read('https://example.com', { markdown: true });

      // Readability extracts main content, should have some text from example.com
      expect(markdown).toBeTruthy();
      expect(markdown.length).toBeGreaterThan(0);
      // Should contain some content from the page (either heading or body text)
      const hasContent = markdown.includes('Example Domain') ||
                         markdown.includes('documentation') ||
                         markdown.includes('iana.org');
      expect(hasContent).toBe(true);
    } finally {
      await browserManager.close();
    }
  });

  it('should return HTML when markdown is false', async () => {
    profileDir = mkdtempSync(join(tmpdir(), 'lws-test-'));
    const testConfig = getTestConfig(profileDir);
    const browserManager = new BrowserManager(testConfig);
    const reader = new PageReader(browserManager, testConfig);

    try {
      const html = await reader.read('https://example.com', { markdown: false });

      // Should contain HTML tags and content
      expect(html).toMatch(/<h[1-6]/);
      expect(html).toContain('Example Domain');
    } finally {
      await browserManager.close();
    }
  });

  it('should fallback to raw HTML when Readability fails', async () => {
    profileDir = mkdtempSync(join(tmpdir(), 'lws-test-'));
    const testConfig = getTestConfig(profileDir);
    const browserManager = new BrowserManager(testConfig);
    const reader = new PageReader(browserManager, testConfig);

    try {
      const content = await reader.read('https://example.com', { markdown: true });

      expect(content).toBeTruthy();
      expect(content.length).toBeGreaterThan(0);
    } finally {
      await browserManager.close();
    }
  });

  it('should handle invalid URL', async () => {
    profileDir = mkdtempSync(join(tmpdir(), 'lws-test-'));
    const testConfig = getTestConfig(profileDir);
    const browserManager = new BrowserManager(testConfig);
    const reader = new PageReader(browserManager, testConfig);

    try {
      await expect(reader.read('not-a-url', { markdown: true }))
        .rejects.toThrow();
    } finally {
      await browserManager.close();
    }
  });
});
