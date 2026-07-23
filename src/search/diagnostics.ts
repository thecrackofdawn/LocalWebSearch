/**
 * Diagnostic snapshot of a Google search-results page, for logging when a search
 * returns zero results. Lets us tell apart the common causes from logs alone,
 * without re-running the search by hand:
 *   - consent redirect        -> markers contains 'consent.google', finalUrl is consent.*
 *   - captcha / anti-bot block -> markers contains '/sorry', 'captcha', 'unusual traffic'
 *   - results not yet rendered -> counts.resultAnchors === 0 but markers empty and
 *                                 counts.anchors/h3s > 0 (timing); or all zero (blank)
 *   - DOM rotated again       -> counts.resultAnchors === 0 with no markers (investigate)
 *
 * Pure + DOM-only, so it is unit-testable with JSDOM and runs on the same JSDOM
 * document we already parse for extraction (no extra browser round-trips).
 */

export interface SearchDiagnostic {
  title: string;
  finalUrl: string;
  counts: { anchors: number; h3s: number; resultAnchors: number };
  markers: string[];
  bodySnippet: string;
}

const MARKERS = [
  'consent.google',
  '/sorry',
  'captcha',
  'recaptcha',
  'unusual traffic',
  'before you continue',
  'detected unusual',
];

export function describeSearchPage(doc: Document, finalUrl: string): SearchDiagnostic {
  const bodyText = (doc.body?.textContent || '').replace(/\s+/g, ' ').trim();
  const haystack = (finalUrl + ' ' + bodyText).toLowerCase();
  const markers = MARKERS.filter((m) => haystack.includes(m));

  const anchors = doc.querySelectorAll('a');
  let resultAnchors = 0;
  for (const a of Array.from(anchors)) {
    if (a.querySelector('h3') && a.getAttribute('href')) resultAnchors++;
  }

  return {
    title: (doc.title || '').slice(0, 120),
    finalUrl,
    counts: {
      anchors: anchors.length,
      h3s: doc.querySelectorAll('h3').length,
      resultAnchors,
    },
    markers,
    bodySnippet: bodyText.slice(0, 300),
  };
}
