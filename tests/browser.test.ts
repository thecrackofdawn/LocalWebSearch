import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BrowserManager } from '../src/browser/browser.js';
import { Config } from '../src/config/config.js';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('BrowserManager', () => {
  let manager: BrowserManager;
  let profileDir: string;

  beforeEach(() => {
    profileDir = mkdtempSync(join(tmpdir(), 'lws-test-'));
  });

  const makeConfig = (): Config => ({
    engine: 'google',
    results: 10,
    stealth: true,
    timeout: 30000,
    retries: 3,
    browser: {
      headless: true,
      userAgent: null,
      profilePath: profileDir
    }
  });

  afterEach(async () => {
    if (manager) {
      await manager.close();
    }
    rmSync(profileDir, { recursive: true, force: true });
  });

  it('should launch browser on first access', async () => {
    manager = new BrowserManager(makeConfig());
    const browser = await manager.getBrowser();
    expect(browser).toBeDefined();
    expect(browser.isConnected()).toBe(true);
  });

  it('should reuse browser instance on subsequent calls', async () => {
    manager = new BrowserManager(makeConfig());
    const browser1 = await manager.getBrowser();
    const browser2 = await manager.getBrowser();
    expect(browser1).toBe(browser2);
  });

  it('should track request count', async () => {
    manager = new BrowserManager(makeConfig());
    await manager.getBrowser();
    expect(manager.getRequestCount()).toBe(1);
    await manager.getBrowser();
    expect(manager.getRequestCount()).toBe(2);
  });

  it('should detect when restart is needed (100 calls)', async () => {
    manager = new BrowserManager(makeConfig());

    // Simulate 99 calls
    for (let i = 0; i < 99; i++) {
      manager.incrementRequestCount();
    }

    expect(manager.shouldRestart()).toBe(false);

    manager.incrementRequestCount();
    expect(manager.shouldRestart()).toBe(true);
  });
});
