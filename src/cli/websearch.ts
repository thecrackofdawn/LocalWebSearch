import { Command } from 'commander';
import { ConfigManager } from '../config/config.js';
import { BrowserManager } from '../browser/browser.js';
import { SearchEngine } from '../search/search.js';
import { join } from 'path';
import { homedir } from 'os';

export const websearchCommand = new Command('websearch')
  .description('Perform web search')
  .argument('<query>', 'Search query')
  .option('-e, --engine <engine>', 'Search engine', 'google')
  .option('-r, --results <number>', 'Number of results', '10')
  .option('--no-stealth', 'Disable stealth mode')
  .action(async (query, options) => {
    const configManager = new ConfigManager(join(homedir(), '.localwebsearch', 'config.json'));
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
