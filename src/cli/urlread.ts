import { Command } from 'commander';
import { ConfigManager } from '../config/config.js';
import { BrowserManager } from '../browser/browser.js';
import { PageReader } from '../reader/reader.js';
import { join } from 'path';
import { homedir } from 'os';

export const urlreadCommand = new Command('urlread')
  .description('Read URL content')
  .argument('<url>', 'URL to read')
  .option('--no-markdown', 'Return raw HTML instead of Markdown')
  .option('-s, --selector <selector>', 'CSS selector for content', 'body')
  .option('--no-stealth', 'Disable stealth mode')
  .action(async (url, options) => {
    const configManager = new ConfigManager(join(homedir(), '.localwebsearch', 'config.json'));
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
