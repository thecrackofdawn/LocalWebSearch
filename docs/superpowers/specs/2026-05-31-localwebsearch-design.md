# Local WebSearch MCP Tool - Design Specification

**Date:** 2026-05-31
**Status:** Approved
**Language:** TypeScript/Node.js

## Overview

A local browser-based web search and URL reading MCP tool that leverages the user's actual browser session (login state, cookies, proxy settings) to perform searches and read web content. The tool uses Playwright for browser automation with stealth capabilities to avoid bot detection.

## Architecture

### System Architecture

The system is a TypeScript/Node.js CLI application that exposes MCP tools (`websearch` and `urlread`). Each MCP invocation triggers an independent CLI execution that:

1. Launches a browser (system Chrome/Edge or Playwright Chromium)
2. Applies stealth techniques to avoid detection
3. Performs the requested operation (search or read)
4. Returns results to stdout
5. Closes the browser

### Key Design Decisions

- **CLI-style MCP:** Each call is independent - no persistent server or background threads
- **Hybrid browser strategy:** Prioritize system Chrome, fallback to Playwright Chromium
- **Stealth by default:** Use playwright-stealth to avoid bot detection
- **Persistent profile:** Browser state stored in `./browser_profile/` alongside the tool
- **Config-driven:** JSON configuration with environment variable overrides

## Components

### Browser Manager (`src/browser/browser.ts`)

**Responsibilities:**
- Launch browser with stealth techniques
- Handle hybrid browser selection (system Chrome → Playwright Chromium)
- Manage browser lifecycle per CLI invocation
- Apply playwright-stealth configuration

**Key Methods:**
- `launchBrowser(config: BrowserConfig): Promise<Browser>` - Launch browser with stealth
- `closeBrowser(browser: Browser): Promise<void>` - Clean shutdown

**Stealth Techniques:**
- Remove `navigator.webdriver` flag
- Spoof user agent, platform, vendor
- Patch `navigator.plugins`, `navigator.languages`
- Randomize canvas fingerprint (optional)

### Search Engine (`src/search/search.ts`)

**Responsibilities:**
- Execute web searches via Google
- Extract search results (title, URL, snippet)
- Handle selector fallbacks for DOM changes

**Key Methods:**
- `websearch(query: string, options: SearchOptions): Promise<SearchResult[]>`

**Output Format:**
```json
{
  "results": [
    {"title": "...", "url": "...", "snippet": "..."}
  ]
}
```

### Page Reader (`src/reader/reader.ts`)

**Responsibilities:**
- Load pages and wait for JavaScript execution
- Extract main HTML content
- Handle page load timeouts and errors

**Key Methods:**
- `urlread(url: string, options: ReaderOptions): Promise<string>`

**Waiting Strategy:**
- Wait for network idle
- Wait for JavaScript execution completion
- Configurable timeout (default: 30s)

### Config Manager (`src/config/config.ts`)

**Responsibilities:**
- Load configuration from JSON file
- Apply environment variable overrides
- Provide defaults for missing values

**Config File Location:** `./localwebsearch.json` (alongside tool)

**Default Configuration:**
```json
{
  "engine": "google",
  "results": 10,
  "stealth": true,
  "timeout": 30000,
  "retries": 3,
  "browser": {
    "headless": false,
    "userAgent": null,
    "profilePath": "./browser_profile"
  }
}
```

### Retry Handler (`src/retry/retry.ts`)

**Responsibilities:**
- Decorator for retrying transient errors
- Exponential backoff (1s, 2s, 4s)
- 3 attempts by default

**Retryable Errors:**
- Browser crashes
- Network timeouts
- Google temporary blocking

### CLI Interface (`src/cli/`)

**Commands:**
```bash
localwebsearch websearch "query" [--engine google] [--results 10]
localwebsearch urlread "url" [--no-stealth] [--timeout 30000]
localwebsearch init              # Initialize config file
localwebsearch config [get|set] <key> [value]
```

**Output:**
- JSON to stdout for websearch
- HTML/text to stdout for urlread
- Errors to stderr
- Appropriate exit codes (0-4)

## Directory Structure

```
localwebsearch/
├── src/
│   ├── index.ts                # CLI entry point
│   ├── cli/                    # CLI commands
│   │   ├── websearch.ts
│   │   └── urlread.ts
│   ├── browser/                # Browser management
│   │   ├── browser.ts          # BrowserManager
│   │   └── stealth.ts          # Stealth configuration
│   ├── search/                 # Search functionality
│   │   └── search.ts           # SearchEngine
│   ├── reader/                 # Page reading
│   │   └── reader.ts           # PageReader
│   ├── config/                 # Configuration
│   │   └── config.ts           # ConfigManager
│   ├── retry/                  # Retry logic
│   │   └── retry.ts            # RetryHandler
│   └── mcp/                    # MCP tools
│       └── tools.ts            # MCP tool schemas
├── browser_profile/            # Persistent browser profile
├── localwebsearch.json         # Configuration file
├── package.json
├── tsconfig.json
├── README.md
└── tests/
    ├── browser.test.ts
    ├── search.test.ts
    └── reader.test.ts
```

## Data Flow

### websearch Flow
```
CLI invocation → Config load → Browser launch (stealth) → Navigate to search URL → Wait for load → Extract results → Retry on failure → Return JSON → Browser close → Exit
```

### urlread Flow
```
CLI invocation → Config load → Browser launch (stealth) → Navigate to target URL → Wait for network idle + JS execution → Extract HTML → Retry on failure → Return HTML → Browser close → Exit
```

## Browser Strategy (Hybrid Mode)

**Priority: System Chrome/Edge**

1. Attempt to use system Chrome:
   - Windows: `C:\Program Files\Google\Chrome\Application\chrome.exe`
   - macOS: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
   - Linux: `/usr/bin/google-chrome`

2. Fallback: Playwright Chromium (auto-downloaded on first use)

3. Profile: `./browser_profile/` used regardless of browser

## Error Handling

### Error Types

**Transient Errors (3 automatic retries):**
- Browser crashes/timeout
- Network errors
- Google temporary blocking/CAPTCHA
- Page load timeout

**Configuration Errors (immediate failure):**
- Invalid config file format
- Missing dependencies
- Invalid CLI parameters

**User Errors (immediate failure, clear message):**
- Invalid URL
- Empty search query
- Permission issues

### Exit Codes
- `0` - Success
- `1` - General error
- `2` - Configuration error
- `3` - Network error (retries exhausted)
- `4` - User error (invalid parameters)

## MCP Integration

### Tool Definitions

**websearch:**
```json
{
  "name": "websearch",
  "description": "Execute web search using local browser with login state",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": {"type": "string", "description": "Search query"},
      "engine": {"type": "string", "default": "google"},
      "results": {"type": "number", "default": 10}
    },
    "required": ["query"]
  }
}
```

**urlread:**
```json
{
  "name": "urlread",
  "description": "Read URL content using local browser with login state",
  "inputSchema": {
    "type": "object",
    "properties": {
      "url": {"type": "string", "description": "URL to read"},
      "selector": {"type": "string", "default": "body"}
    },
    "required": ["url"]
  }
}
```

### Execution Model

- Each MCP tool call = independent CLI execution
- Browser launched per call, closed after completion
- Config and profile shared between calls

## Dependencies

### Runtime Dependencies
```json
{
  "playwright": "^1.40.0",
  "playwright-stealth": "^1.0.0",
  "commander": "^11.1.0",
  "@modelcontextprotocol/sdk": "^1.0.0",
  "chalk": "^4.1.2"
}
```

### Development Dependencies
```json
{
  "@types/node": "^20.10.0",
  "typescript": "^5.3.0",
  "vitest": "^1.0.0",
  "tsx": "^4.6.0"
}
```

## Testing Strategy

### Unit Tests
- Browser manager: launch, close, stealth application
- Config manager: loading, defaults, environment overrides
- Retry decorator: retry logic, backoff behavior

### Integration Tests
- websearch: real searches, result extraction, error handling
- urlread: real pages, JS waiting, content extraction

### Test Approach
- Use Playwright test mode (no browser download)
- Mock network responses where possible
- Test retry behavior with simulated failures

## Environment Variables

Config override support:
- `LOCALWEBSEARCH_ENGINE` - Search engine (default: google)
- `LOCALWEBSEARCH_RESULTS` - Result count (default: 10)
- `LOCALWEBSEARCH_STEALTH` - Enable stealth (default: true)
- `LOCALWEBSEARCH_HEADLESS` - Headless mode (default: false)
