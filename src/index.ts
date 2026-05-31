#!/usr/bin/env node
// src/index.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { ConfigManager, Config } from './config/config.js';
import { BrowserManager } from './browser/browser.js';
import { SearchEngine } from './search/search.js';
import { PageReader } from './reader/reader.js';
import { createTools, handleWebsearch, handleUrlread } from './mcp/tools.js';
import { join } from 'path';
import { homedir } from 'os';

let browserManager: BrowserManager;
let config: Config;
let searchEngine: SearchEngine;
let pageReader: PageReader;

export async function startMcpServer() {
  const configPath = join(homedir(), '.localwebsearch', 'config.json');
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
  const shutdown = async () => {
    await browserManager.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Parent process (MCP client) crashed / stdin pipe broken
  process.stdin.on('close', shutdown);
}

startMcpServer().catch(console.error);
