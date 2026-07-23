import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { extractResults } from '../src/search/extract.js';

const google = (body: string) =>
  new JSDOM(`<html><body>${body}</body></html>`, {
    url: 'https://www.google.com/search?q=test',
  });

describe('extractResults', () => {
  it('extracts organic results from anchors that wrap an <h3>', () => {
    const dom = google(`
      <a href="https://example.com/a"><h3>Title A</h3></a>
      <a href="https://example.com/b"><h3>Title B</h3></a>
    `);
    const r = extractResults(dom.window.document, 10);
    expect(r).toHaveLength(2);
    expect(r[0].title).toBe('Title A');
    expect(r[0].url).toBe('https://example.com/a');
    expect(r[1].title).toBe('Title B');
    expect(r[1].url).toBe('https://example.com/b');
  });

  it('skips Google-internal links (nav, settings, etc.)', () => {
    const dom = google(`
      <a href="https://www.google.com/preferences"><h3>Settings</h3></a>
      <a href="https://maps.google.com/"><h3>Maps</h3></a>
      <a href="https://example.com/real"><h3>Real Result</h3></a>
    `);
    const r = extractResults(dom.window.document, 10);
    expect(r).toHaveLength(1);
    expect(r[0].url).toBe('https://example.com/real');
  });

  it('unwraps /url?q= redirect links to the real destination', () => {
    const dom = google(`
      <a href="/url?q=https://example.com/unwrapped&sa=U&ved=xyz"><h3>Unwrapped</h3></a>
    `);
    const r = extractResults(dom.window.document, 10);
    expect(r).toHaveLength(1);
    expect(r[0].url).toBe('https://example.com/unwrapped');
  });

  it('deduplicates results by URL', () => {
    const dom = google(`
      <a href="https://example.com/dup"><h3>First</h3></a>
      <a href="https://example.com/dup"><h3>Second</h3></a>
    `);
    const r = extractResults(dom.window.document, 10);
    expect(r).toHaveLength(1);
  });

  it('respects the max limit', () => {
    const links = Array.from(
      { length: 5 },
      (_, i) => `<a href="https://example.com/${i}"><h3>Title ${i}</h3></a>`
    ).join('');
    const r = extractResults(google(links).window.document, 3);
    expect(r).toHaveLength(3);
  });

  it('captures a nearby line-clamped snippet', () => {
    const dom = google(`
      <div>
        <a href="https://example.com/s"><h3>With Snippet</h3></a>
        <div style="-webkit-line-clamp:2">This is the snippet text.</div>
      </div>
    `);
    const r = extractResults(dom.window.document, 10);
    expect(r[0].snippet).toBe('This is the snippet text.');
  });

  it('falls back to the nearest anchor when the <h3> is a sibling, not a descendant', () => {
    const dom = google(`
      <div><h3>Sibling Title</h3><a href="https://example.com/sib">go</a></div>
    `);
    const r = extractResults(dom.window.document, 10);
    expect(r).toHaveLength(1);
    expect(r[0].title).toBe('Sibling Title');
    expect(r[0].url).toBe('https://example.com/sib');
  });

  it('returns an empty array when there are no organic results', () => {
    const dom = google(`<div>no results here</div>`);
    expect(extractResults(dom.window.document, 10)).toEqual([]);
  });

  it('does NOT depend on obfuscated Google class names', () => {
    // Mirrors real Google markup; classes must be irrelevant to extraction.
    const dom = google(`
      <div class="tF2Cxc"><div class="yuRUbf"><a href="https://example.com/a"><h3>Classed</h3></a></div></div>
      <div class="MjjYud abc xyz"><a href="https://example.com/b"><h3>Random Classes</h3></a></div>
      <div><a href="https://example.com/c"><h3>No Class</h3></a></div>
    `);
    const r = extractResults(dom.window.document, 10);
    expect(r.map((x) => x.url).sort()).toEqual([
      'https://example.com/a',
      'https://example.com/b',
      'https://example.com/c',
    ]);
  });
});
