#!/usr/bin/env node
import { Command } from 'commander';
import { websearchCommand } from './websearch.js';
import { urlreadCommand } from './urlread.js';
import { ConfigManager } from '../config/config.js';
import { join } from 'path';
import { homedir } from 'os';
import { writeFileSync, mkdirSync } from 'fs';
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
    const configDir = join(homedir(), '.localwebsearch');
    const configPath = join(configDir, 'config.json');
    const defaultConfig = {
      engine: 'google',
      results: 10,
      stealth: true,
      timeout: 30000,
      retries: 3,
      browser: {
        headless: false,
        userAgent: null,
        profilePath: join(homedir(), '.localwebsearch', 'browser_profile')
      }
    };

    mkdirSync(configDir, { recursive: true });
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
