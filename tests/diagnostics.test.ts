import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { describeSearchPage } from '../src/search/diagnostics.js';

const page = (body: string, url = 'https://www.google.com/search?q=test') =>
  new JSDOM(`<html><head><title>title</title></head><body>${body}</body></html>`, {
    url,
  });

describe('describeSearchPage', () => {
  it('reports counts for a normal results page and no markers', () => {
    const dom = page(`
      <a href="https://example.com/a"><h3>A</h3></a>
      <a href="https://example.com/b"><h3>B</h3></a>
      <a href="/help">help</a>
    `);
    const d = describeSearchPage(dom.window.document, dom.window.location.href);
    expect(d.counts).toEqual({ anchors: 3, h3s: 2, resultAnchors: 2 });
    expect(d.markers).toEqual([]);
    expect(d.bodySnippet).toContain('A');
  });

  it('counts resultAnchors only for anchors that wrap an <h3> AND have an href', () => {
    const dom = page(`
      <a href="https://example.com/real"><h3>Real</h3></a>
      <a><h3>No Href</h3></a>
      <a href="https://example.com/no-h3">no title here</a>
    `);
    const d = describeSearchPage(dom.window.document, dom.window.location.href);
    expect(d.counts.resultAnchors).toBe(1);
    expect(d.counts.h3s).toBe(2);
    expect(d.counts.anchors).toBe(3);
  });

  it('detects a consent redirect from the final URL', () => {
    const dom = page('<div>anything</div>');
    const d = describeSearchPage(
      dom.window.document,
      'https://consent.google.com/m?continue=https://www.google.com/search'
    );
    expect(d.markers).toContain('consent.google');
  });

  it('detects /sorry and captcha markers in the body', () => {
    const dom = page(
      '<div>Our systems have detected unusual traffic. Please complete the captcha.</div>',
      'https://www.google.com/sorry/index?q=test'
    );
    const d = describeSearchPage(dom.window.document, dom.window.location.href);
    expect(d.markers).toEqual(expect.arrayContaining(['/sorry', 'unusual traffic', 'captcha']));
  });

  it('detects the "Before you continue" EU consent page', () => {
    const dom = page('<div>Before you continue to Google Search</div>');
    const d = describeSearchPage(dom.window.document, dom.window.location.href);
    expect(d.markers).toContain('before you continue');
  });

  it('truncates the title and body snippet', () => {
    const longTitle = 'T'.repeat(500);
    const longBody = 'B'.repeat(2000);
    const dom = new JSDOM(
      `<html><head><title>${longTitle}</title></head><body>${longBody}</body></html>`,
      { url: 'https://www.google.com/search?q=test' }
    );
    const d = describeSearchPage(dom.window.document, dom.window.location.href);
    expect(d.title.length).toBeLessThanOrEqual(120);
    expect(d.bodySnippet.length).toBeLessThanOrEqual(300);
  });

  it('returns the finalUrl verbatim', () => {
    const dom = page('<div></div>');
    const url = 'https://www.google.com/search?q=test&sei=abc';
    expect(describeSearchPage(dom.window.document, url).finalUrl).toBe(url);
  });
});
