import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'fs';
import { gunzipSync } from 'zlib';
import { join } from 'path';
import { tmpdir } from 'os';
import { Logger } from '../src/logger/logger.js';

describe('Logger', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lws-log-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes timestamped, leveled lines to the active log file', async () => {
    const log = new Logger({ logDir: dir, mirrorToStderr: false });
    await log.info('hello world');
    await log.error('boom');
    await log.flush();

    const content = readFileSync(join(dir, 'localwebsearch.log'), 'utf8');
    expect(content).toMatch(/\d{4}-\d{2}-\d{2}T[\d:.]+Z \[info\] hello world/);
    expect(content).toMatch(/\[error\] boom/);
  });

  it('rotates and gzip-compresses when the active file exceeds maxSize', async () => {
    const log = new Logger({ logDir: dir, maxSize: 80, maxFiles: 3, mirrorToStderr: false });
    for (let i = 0; i < 50; i++) await log.info(`message number ${i}`);
    await log.flush();

    const archives = readdirSync(dir).filter((f) => f.endsWith('.gz'));
    expect(archives.length).toBeGreaterThanOrEqual(1);

    // The most recent archive must be valid gzip of the pre-rotation content.
    const decompressed = gunzipSync(readFileSync(join(dir, 'localwebsearch.log.1.gz'))).toString();
    expect(decompressed).toMatch(/\[info\] message number \d+/);

    // Active file must have been reset (small), not still holding everything.
    const activeSize = readFileSync(join(dir, 'localwebsearch.log')).length;
    expect(activeSize).toBeLessThan(80 + 200); // < one rotation threshold + a line
  });

  it('keeps at most maxFiles compressed archives', async () => {
    const log = new Logger({ logDir: dir, maxSize: 64, maxFiles: 2, mirrorToStderr: false });
    for (let i = 0; i < 200; i++) await log.info('x'.repeat(20));
    await log.flush();

    const archives = readdirSync(dir).filter((f) => f.endsWith('.gz'));
    expect(archives.length).toBeLessThanOrEqual(2);
    expect(archives).toContain('localwebsearch.log.1.gz');
  });

  it('uses the configured baseName for active and archive file names', async () => {
    const log = new Logger({
      logDir: dir,
      baseName: 'search.log',
      maxSize: 50,
      maxFiles: 2,
      mirrorToStderr: false,
    });
    for (let i = 0; i < 30; i++) await log.info(`line ${i}`);
    await log.flush();

    const files = readdirSync(dir);
    expect(files).toContain('search.log');
    expect(files).toContain('search.log.1.gz');
  });
});
