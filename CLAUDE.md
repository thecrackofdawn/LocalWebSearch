# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

### Building and Development
```bash
npm run build              # Compile TypeScript to dist/
npm run dev                # Run MCP server directly with tsx
npm test                   # Run tests in watch mode
npm run test:run           # Run tests once
```

### Running Single Tests
```bash
npm test tests/config.test.ts
npm test tests/browser.test.ts
npm test tests/reader.test.ts
```

### CLI Usage
```bash
localwebsearch init                        # Create default config file
localwebsearch websearch "query"         # Direct CLI search (creates temp browser)
localwebsearch urlread "https://..."     # Direct CLI read (creates temp browser)
localwebsearch                             # Start MCP server (stdio-based, long-running)
```

### Testing Browser-Dependent Features
Tests that require Playwright browsers may fail due to network issues or Google's anti-bot measures. This is expected and documented in the test specs.

## Architecture Overview

### Long-Running MCP Server Model
This is **NOT** a CLI tool that launches a browser per execution. It is a **long-running MCP server** (stdio-based) that:

1. **Launches browser once at startup** with persistent context (`~/.localwebsearch/browser_profile/`)
2. **Maintains browser in memory** for the entire server lifetime
3. **Each MCP tool call creates a new tab**, performs operation, closes tab
4. **Auto-restarts browser** after 100 requests OR 1 hour idle (memory leak prevention)

**Why this matters:** Browser cold-start takes 1.5-3 seconds. Tab creation takes milliseconds. This design is critical for performance.

### Request Flow
```
MCP tool call → BrowserManager.restartIfNeeded() → Create new tab → Perform operation → Close tab → Return result
```

The `restartIfNeeded()` check is **before each request** to prevent memory leaks from long-running sessions.

### ESM Module System
**Critical:** This project uses `"type": "module"` (ESM). All imports must use bare specifiers or `.js` extensions:

```typescript
import { Config } from './config/config.js';  // Correct - .js extension required
import { Config } from './config/config';     // Wrong - will fail at runtime
```

Never use `require()` - it does not exist in ESM mode.

### Browser Lifecycle Components

**BrowserManager** (`src/browser/browser.ts`) is the core component that:
- Uses `chromium.launchPersistentContext()` (NOT `launchPersistent()` - the API evolved)
- Finds system Chrome first, falls back to Playwright Chromium
- Applies stealth via custom scripts (`src/browser/stealth.ts`) - playwright-stealth package is broken with Playwright 1.49+
- Tracks request count and idle time for automatic restart

**Important:** When using persistent context, closing the context automatically closes the browser. The `close()` method should NOT call `browser.close()` separately (this was a fixed bug).

### Content Processing Pipeline

**PageReader** (`src/reader/reader.ts`) implements a critical pipeline:

1. **Composite waiting:** `Promise.race([domcontentloaded, 2000ms])` + 1000ms for JS
   - Avoids `networkidle` hang (modern pages never stop network requests)
2. **JSDOM + Readability:** Extract clean content (NOT DOMParser - that's browser-only)
3. **Turndown:** Convert to Markdown (90% size reduction for AI consumption)
4. **Fallback:** If Readability fails, use raw HTML

### Search Result Extraction

**SearchEngine** (`src/search/search.ts`) extracts results via a pure, unit-tested
extractor (`src/search/extract.ts`) run on a JSDOM parse of the rendered page HTML.

The extractor is **deliberately class-name-independent**. Google rotates its
obfuscated result-container classes (`div.g`, `div.tF2Cxc`, `div.MjjYud`, …) every
few weeks, so selectors based on them silently return 0 results after each rotation
(this was a real bug — a previous `div.g`/`div[data-hveid]` selector strategy plus
per-element Playwright locator timeouts returned empty/slow results and was
mistakenly attributed to "anti-bot"). Instead it relies on a structural invariant:
every organic result is an `<a href>` wrapping an `<h3>` title and pointing off-site.

Do **not** assume empty results are anti-bot. Verify first (e.g. dump
`page.url()`, `page.title()`, and `document.querySelectorAll('a')` count). Genuine
anti-bot (`/sorry/` captcha, consent page) can still occur, but it is the exception,
not the default.

### Configuration System

**ConfigManager** (`src/config/config.ts`) provides:
1. Default configuration (matches design spec)
2. File-based overrides via `~/.localwebsearch/config.json`
3. Environment variable overrides (prefix: `LOCALWEBSEARCH_`)

Environment variables take highest priority and allow deployment-time configuration without code changes.

### Key Dependencies
- **playwright-stealth:** Package is broken with Playwright 1.49+ - we use custom stealth implementation instead
- **jsdom:** Required for Node.js DOM parsing (browser APIs like DOMParser don't exist in Node.js)
- **@mozilla/readability:** Content extraction (produces clean article content)
- **turndown:** HTML to Markdown conversion

## Critical Implementation Details

### Memory Leak Prevention
The browser auto-restarts after:
- 100 tool calls (request counter)
- 1 hour of idle time (activity tracker)

This prevents multi-GB memory growth over long-running sessions while remaining transparent to users.

### Stealth Configuration
Custom stealth techniques are applied via `context.addInitScript()` in `src/browser/stealth.ts`:
- Removes `navigator.webdriver` flag
- Mocks `navigator.plugins` and `navigator.languages`
- Chrome launch args: `--disable-blink-features=AutomationControlled`

### Retry Logic
All network/browser operations use the `withRetry` decorator (`src/retry/retry.ts`):
- 3 attempts with exponential backoff (1s, 2s, 4s)
- Logs errors to stderr between retries
- Used by SearchEngine and PageReader

### Cookie Management
Cookie export/import (`src/cookie/`) enables login state synchronization:
- Export: Saves cookies to JSON with timestamp
- Import: Loads cookies into persistent browser context
- Useful for migrating login state from primary browser

## Project Context

This tool implements the design specification at `docs/superpowers/specs/2026-05-31-localwebsearch-design.md`. The design evolved from CLI-per-execution to long-running server during brainstorming to achieve acceptable performance for AI assistant usage.

The implementation plan is at `docs/superpowers/plans/2026-05-31-localwebsearch.md` with 13 tasks that were completed via subagent-driven development.
