import type { SearchResult } from './search.js';

/**
 * Extract organic Google search results from a parsed Document.
 *
 * Why this exists: Google rotates the obfuscated class names it uses for result
 * containers (`div.g`, `div.tF2Cxc`, `div.MjjYud`, …) every few weeks. Selectors
 * based on those classes silently return zero results after each rotation (the
 * bug this corrects). Instead we rely on a *structural* invariant that has been
 * stable for years: every organic result is an `<a href>` that wraps (or sits
 * beside) an `<h3>` title and points off-site. No class names required.
 *
 * The function is pure and uses only standard DOM APIs (plus the global `URL`),
 * so it is (a) unit-testable with JSDOM fixtures and (b) serializable via
 * `Function.prototype.toString` to run inside the browser page through
 * `page.evaluate`. Keep it free of closures/imports so the serialized form runs
 * standalone in the page context.
 *
 * @param doc  the parsed search-results document
 * @param max  maximum number of results to return
 */
export function extractResults(doc: Document, max: number): SearchResult[] {
  const base =
    (doc.location && doc.location.href) || 'https://www.google.com/search';
  const seen = new Set<string>();
  const items: SearchResult[] = [];

  const consider = (a: Element, h3: Element | null) => {
    if (items.length >= max) return;

    const href = a.getAttribute('href') || '';
    if (!href) return;

    // Unwrap Google's /url?q=<real> redirect wrapper if present.
    let raw = href;
    try {
      const parsed = new URL(href, base);
      if (parsed.pathname === '/url' && parsed.searchParams.get('q')) {
        raw = parsed.searchParams.get('q') as string;
      }
    } catch {
      // Not a parseable URL yet; try raw as-is below.
    }

    // Resolve to an absolute URL and skip Google-internal links.
    let url: string;
    try {
      const resolved = new URL(raw, base);
      if (/(^|\.)google\./.test(resolved.hostname)) return;
      url = resolved.href;
    } catch {
      return;
    }

    const title = (h3?.textContent || '').replace(/\s+/g, ' ').trim();
    if (!title) return;
    if (seen.has(url)) return;
    seen.add(url);

    // Snippet: nearest ancestor (including the anchor) that has a Google-style
    // line-clamped text block.
    let snippet = '';
    let node: Element | null = a;
    for (let i = 0; i < 6 && node; i++, node = node.parentElement) {
      const s = node.querySelector('[style*="-webkit-line-clamp"]');
      if (s) {
        snippet = (s.textContent || '').replace(/\s+/g, ' ').trim();
        break;
      }
    }

    items.push({ title, url, snippet });
  };

  // Primary signal: an anchor that contains an <h3>.
  for (const a of Array.from(doc.querySelectorAll('a'))) {
    if (items.length >= max) break;
    const h3 = a.querySelector('h3');
    if (h3) consider(a, h3);
  }

  // Fallback signal: an <h3> that is a sibling of (not nested in) its anchor.
  // Only consulted when the primary signal found nothing.
  if (items.length === 0) {
    for (const h3 of Array.from(doc.querySelectorAll('h3'))) {
      if (items.length >= max) break;
      const a =
        h3.closest('a') ||
        (h3.parentElement ? h3.parentElement.querySelector('a') : null);
      if (a) consider(a, h3);
    }
  }

  return items.slice(0, max);
}
