# Local WebSearch MCP Tool - Design Specification

**Date:** 2026-05-31
**Status:** Approved (Final)
**Language:** TypeScript/Node.js
**Revision:** 2 - Added defensive programming strategies: interactive login, composite waiting, Readability fallback, memory leak prevention

## Overview

A local browser-based web search and URL reading MCP tool that leverages the user's actual browser session (login state, cookies, proxy settings) to perform searches and read web content. The tool uses Playwright for browser automation with stealth capabilities to avoid bot detection.

## Architecture

### System Architecture

The system is a TypeScript/Node.js **long-running MCP server** (stdio-based) that maintains a persistent browser instance in memory. The server:

1. **Startup:** Launches browser once with persistent context
2. **Each MCP call:** Creates a new tab (`context.newPage()`), performs operation, closes tab
3. **Browser lifecycle:** Browser stays in memory for the duration of the MCP server session
4. **Shutdown:** Browser closed when MCP server exits

### Key Design Decisions

- **Long-running MCP Server:** Maintains persistent browser context to avoid cold-start overhead (1.5-3s per call)
- **Tab-per-call model:** Each tool call creates a new tab, closed after completion (milliseconds vs seconds)
- **Hybrid browser strategy:** Prioritize system Chrome, fallback to Playwright Chromium
- **Stealth by default:** Use playwright-stealth plus advanced techniques to avoid bot detection
- **Isolated profile:** Dedicated `./browser_profile/` to avoid conflicts with user's running Chrome
- **Config-driven:** JSON configuration with environment variable overrides
- **Markdown output:** Page content converted to clean Markdown to minimize token usage

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
- `shouldRestart(): boolean` - Check if browser needs restart (memory management)

**Memory Leak Prevention:**
- **Request Counter:** Track total tool calls in current session
- **Idle Timer:** Track time since last request
- **Auto-Restart Triggers:**
  - After 100+ tool calls (proactive restart)
  - After 1 hour of idle time (cleanup idle resources)
- **Transparent Restart:** Restart occurs between requests, user-unaware

**Rationale:** Long-running browser contexts accumulate memory from cache, canvas rendering, and JS closures. Periodic restarts prevent memory growth (multi-GB over days) while maintaining performance.

**Stealth Techniques:**
- Remove `navigator.webdriver` flag
- Spoof user agent, platform, vendor
- Patch `navigator.plugins`, `navigator.languages`
- Randomize canvas fingerprint (optional)
- **Headless mode:** Use `--headless=new` for latest Chromium headless
- **TLS/Network layer:** Consider undici for advanced TLS fingerprinting (future enhancement)

**Anti-Detection Strategy:**
- playwright-stealth provides baseline protection
- Non-headless mode (default) avoids 80% of detection vectors
- For advanced anti-bot systems (Cloudflare Turnstile, Akamai):
  - May require additional browser extensions
  - Or TLS-level spoofing (undici/curl-impersonate)
  - These are optional enhancements for advanced users

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
- Extract main content using Mozilla Readability
- Convert to Markdown using Turndown to minimize token usage
- Handle page load timeouts and errors

**Key Methods:**
- `urlread(url: string, options: ReaderOptions): Promise<string>`

**Content Processing Pipeline (with Fallback):**
1. Wait for page load (composite strategy)
2. Extract main content with `@mozilla/readability`
3. **Fallback Logic:**
   - If Readability succeeds → Use extracted article content
   - If Readability fails (non-article pages like dashboards, tables, APIs) → Fall back to `body.innerHTML` or custom selector
4. Convert to Markdown with `turndown`
5. Return clean Markdown (90% smaller than raw HTML)

**Readability Failure Handling:**
```typescript
const article = reader.parse(document);
let contentToConvert = "";

if (article && article.content) {
  contentToConvert = article.content; // Clean article content
} else {
  // Fallback: Non-article page, use raw body or selector
  contentToConvert = await page.innerHTML(options.selector || 'body');
}
```

**Rationale:** Readability is heuristic-based and fails on non-article content (dashboards, data tables, code-heavy docs, SPAs). Fallback ensures we always return useful content.

**Waiting Strategy (Composite Approach):**
- **Primary:** Wait for `domcontentloaded` or `load` event
- **Secondary:** Fixed delay (1-2s) for JS execution
- **Fallback:** `Promise.race` with timeout to avoid hanging
- **Avoid:** Hard dependency on `networkidle` (may never fire on pages with continuous requests)

**Rationale:** Modern pages often have perpetual background requests (analytics, ads, keep-alive) that prevent `networkidle` from ever triggering, causing 30s timeout failures.

**Implementation Pattern:**
```typescript
await Promise.race([
  page.waitForLoadState('domcontentloaded'),
  page.waitForTimeout(2000)
]);
await page.waitForTimeout(1000); // Allow JS execution
```

**Output Options:**
- `markdown: true` (default) - Returns clean Markdown
- `markdown: false` - Returns raw HTML (for debugging)

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

**MCP Server Mode (primary):**
```bash
localwebsearch                    # Start MCP server (stdio-based)
localwebsearch --help             # Show help
```

**Configuration Commands:**
```bash
localwebsearch init              # Initialize config file
localwebsearch config [get|set] <key> [value]
```

**Cookie Management (login state sync):**
```bash
localwebsearch login <url>                   # Interactive login in browser
localwebsearch export-cookies                # Export cookies from current profile
localwebsearch import-cookies <file.json>     # Import cookies to profile
```

**Login Command:**
- Opens headed browser window to target URL
- User manually completes login (OAuth, password, 2FA, etc.)
- Cookies automatically saved on window close
- **Recommended method** - preserves User-Agent consistency

**Direct CLI Mode (for testing/debugging):**
```bash
localwebsearch websearch "query" [--engine google] [--results 10]
localwebsearch urlread "url" [--no-stealth] [--timeout 30000] [--no-markdown]
```

**Output (direct CLI mode):**
- JSON to stdout for websearch
- Markdown to stdout for urlread (HTML if --no-markdown)
- Errors to stderr
- Appropriate exit codes (0-4)

## Directory Structure

```
localwebsearch/
├── src/
│   ├── index.ts                # MCP server entry point
│   ├── server.ts               # MCP server setup (stdio-based)
│   ├── cli/                    # Direct CLI commands (testing/debug)
│   │   ├── index.ts
│   │   ├── websearch.ts
│   │   └── urlread.ts
│   ├── cookie/                 # Cookie management
│   │   ├── export.ts           # Cookie export
│   │   └── import.ts           # Cookie import
│   ├── browser/                # Browser management
│   │   ├── browser.ts          # BrowserManager (persistent context)
│   │   └── stealth.ts          # Stealth configuration
│   ├── search/                 # Search functionality
│   │   └── search.ts           # SearchEngine
│   ├── reader/                 # Page reading
│   │   └── reader.ts           # PageReader (Readability + Turndown)
│   ├── config/                 # Configuration
│   │   └── config.ts           # ConfigManager
│   ├── retry/                  # Retry logic
│   │   └── retry.ts            # RetryHandler
│   └── mcp/                    # MCP tools
│       └── tools.ts            # MCP tool schemas + handlers
├── browser_profile/            # Isolated browser profile (auto-created)
├── localwebsearch.json         # Configuration file (auto-created)
├── package.json
├── tsconfig.json
├── README.md
└── tests/
    ├── browser.test.ts
    ├── search.test.ts
    └── reader.test.ts
```

## Data Flow

### Server Startup Flow
```
MCP server start → Config load → Browser launch (stealth) with persistent context → Ready for requests
```

### websearch Flow
```
MCP call → Create new tab → Navigate to search URL → Wait for load → Extract results → Close tab → Return JSON
```

### urlread Flow
```
MCP call → Create new tab → Navigate to target URL → Wait for network idle + JS execution → Extract main content (Readability) → Convert to Markdown (Turndown) → Close tab → Return Markdown
```

### Server Shutdown Flow
```
MCP server stop → Close browser context → Clean shutdown → Exit
```

## Browser Strategy (Hybrid Mode)

**Priority: System Chrome/Edge**

1. Attempt to use system Chrome:
   - Windows: `C:\Program Files\Google\Chrome\Application\chrome.exe`
   - macOS: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
   - Linux: `/usr/bin/google-chrome`

2. Fallback: Playwright Chromium (auto-downloaded on first use)

3. **Isolated Profile:** `./browser_profile/` is a dedicated, isolated profile directory
   - **Prevents conflicts** with user's running Chrome instance
   - Avoids file lock issues when user's main Chrome is active
   - Separate from user's primary browser profile

**Login State Management:**

**Interactive Login (Recommended):**
- `localwebsearch login <url>` - Opens headed browser for manual login
- User completes login in the opened window
- Cookies automatically persisted to `./browser_profile/` on window close
- Most foolproof method - preserves User-Agent consistency

**Cookie Import/Export (Advanced):**
- `localwebsearch export-cookies` - Export cookies from current profile
- `localwebsearch import-cookies <file.json>` - Import cookies to profile
- **Critical:** Ensure User-Agent consistency between export and import
- **Risk:** Some sites bind cookies to specific UA headers
- **Use case:** Migrating cookies from other browsers/tools

**Cookie Best Practices:**
- Always use consistent User-Agent for cookie import
- Validate imported cookies before use
- Consider cookie expiration and refresh tokens

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

### Error Responses

**MCP Server Mode:**
- Errors returned as structured error responses to MCP client
- Includes error code, message, and retry info
- Server continues running for subsequent requests

**Direct CLI Mode (exit codes):**
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
  "description": "Read URL content using local browser with login state. Returns clean Markdown by default.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "url": {"type": "string", "description": "URL to read"},
      "markdown": {"type": "boolean", "default": true, "description": "Return Markdown (true) or raw HTML (false)"},
      "selector": {"type": "string", "default": "body", "description": "CSS selector for content extraction"}
    },
    "required": ["url"]
  }
}
```

### Execution Model

- **Long-running MCP server** via stdio
- Browser launched once at server startup, closed at server shutdown
- Each tool call creates a new tab, closed after operation completes
- Config and profile shared between all calls in the same server session

## Dependencies

### Runtime Dependencies
```json
{
  "playwright": "^1.49.0",
  "playwright-stealth": "^1.0.0",
  "@mozilla/readability": "^0.5.0",
  "turndown": "^7.1.2",
  "commander": "^11.1.0",
  "@modelcontextprotocol/sdk": "^1.0.0",
  "chalk": "^4.1.2"
}
```

**Version Notes:**
- Playwright ^1.49.0+ for latest anti-detection improvements
- chalk ^4.1.2 (avoid v5.0+ ESM-only issues)
- @mozilla/readability for content extraction
- turndown for HTML to Markdown conversion

### Development Dependencies
```json
{
  "@types/node": "^20.10.0",
  "@types/turndown": "^5.0.4",
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
