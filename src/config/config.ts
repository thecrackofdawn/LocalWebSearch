import { readFileSync, writeFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

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
    headless: true,
    userAgent: null,
    profilePath: join(homedir(), '.localwebsearch', 'browser_profile')
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
