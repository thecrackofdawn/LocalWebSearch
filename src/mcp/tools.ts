// src/mcp/tools.ts
import { SearchEngine, SearchResult } from '../search/search.js';
import { PageReader } from '../reader/reader.js';
import { BrowserManager } from '../browser/browser.js';
import { Config } from '../config/config.js';
import { Tool } from '@modelcontextprotocol/sdk/types.js';

export function createTools(
  _browserManager: BrowserManager,
  _config: Config
): Tool[] {

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
