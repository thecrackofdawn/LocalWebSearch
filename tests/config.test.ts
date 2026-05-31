import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConfigManager } from '../src/config/config.js';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

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
        headless: true,
        userAgent: null,
        profilePath: join(homedir(), '.localwebsearch', 'browser_profile')
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
