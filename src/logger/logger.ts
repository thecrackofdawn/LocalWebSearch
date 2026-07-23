import { mkdirSync } from 'fs';
import { appendFile, readFile, rename, stat, truncate, unlink, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { gzipSync } from 'zlib';

export type LogLevel = 'info' | 'warn' | 'error';

export interface LoggerOptions {
  /** Directory holding the active log file and rotated archives. */
  logDir: string;
  /** Active file name. Archives become `<baseName>.<n>.gz`. */
  baseName?: string;
  /** Rotate once the active file reaches this many bytes. Default: 1 MiB. */
  maxSize?: number;
  /** Maximum number of compressed archive files to keep. Default: 5. */
  maxFiles?: number;
  /** Also write each line to stderr (useful for MCP, which captures stderr). Default: true. */
  mirrorToStderr?: boolean;
}

const ONE_MB = 1024 * 1024;

/**
 * Default log directory: a `logs/` folder at the deployed module's root.
 * This file lives at `<root>/{src,dist}/logger/logger.{ts,js}`, so the module
 * root is two directories up -- which resolves correctly whether the server runs
 * from source (tsx) or the compiled dist build.
 */
export function getDefaultLogDir(): string {
  const here = fileURLToPath(import.meta.url);
  return join(resolve(dirname(here), '..', '..'), 'logs');
}

/**
 * A small rotating file logger.
 *
 * - Writes plain timestamped lines to `<logDir>/<baseName>`.
 * - When the active file reaches `maxSize`, gzip-compresses it into
 *   `<baseName>.1.gz`, shifting older archives up and dropping the one beyond
 *   `maxFiles`.
 * - Writes are serialized through a promise chain so concurrent log calls and
 *   rotations never interleave.
 * - Optionally mirrors to stderr (on by default) so MCP integrations that
 *   capture stderr still see the output.
 *
 * stdout is never written to -- it is reserved for the MCP JSON-RPC protocol.
 */
export class Logger {
  private readonly logDir: string;
  private readonly baseName: string;
  private readonly maxSize: number;
  private readonly maxFiles: number;
  private readonly mirrorToStderr: boolean;
  private chain: Promise<void> = Promise.resolve();
  private dirEnsured = false;

  constructor(opts: LoggerOptions) {
    this.logDir = opts.logDir;
    this.baseName = opts.baseName ?? 'localwebsearch.log';
    this.maxSize = opts.maxSize ?? ONE_MB;
    this.maxFiles = opts.maxFiles ?? 5;
    this.mirrorToStderr = opts.mirrorToStderr ?? true;
  }

  private get activePath(): string {
    return join(this.logDir, this.baseName);
  }

  private archivePath(n: number): string {
    return join(this.logDir, `${this.baseName}.${n}.gz`);
  }

  info(msg: string): void {
    this.log('info', msg);
  }
  warn(msg: string): void {
    this.log('warn', msg);
  }
  error(msg: string): void {
    this.log('error', msg);
  }

  log(level: LogLevel, msg: string): void {
    const line = `${new Date().toISOString()} [${level}] ${msg}`;
    if (this.mirrorToStderr) console.error(line);
    this.ensureDir();
    // Serialize so concurrent appends and rotations never interleave, and so a
    // failure in one write can never break the chain for subsequent ones.
    this.chain = this.chain
      .then(() => this.append(line))
      .catch(() => {
        /* best-effort logging: swallow to keep the chain alive */
      });
  }

  /** Resolve once all queued writes have completed. */
  flush(): Promise<void> {
    return this.chain;
  }

  private ensureDir(): void {
    if (!this.dirEnsured) {
      mkdirSync(this.logDir, { recursive: true });
      this.dirEnsured = true;
    }
  }

  private async append(line: string): Promise<void> {
    let size = 0;
    try {
      size = (await stat(this.activePath)).size;
    } catch {
      // Active file not created yet.
    }
    if (size >= this.maxSize) {
      await this.rotate();
    }
    await appendFile(this.activePath, line + '\n', 'utf8');
  }

  private async rotate(): Promise<void> {
    // Shift archives up: free slot n (dropping the oldest beyond maxFiles), then
    // move (n-1) into it, for n = maxFiles down to 2.
    for (let n = this.maxFiles; n >= 2; n--) {
      const from = this.archivePath(n - 1);
      const to = this.archivePath(n);
      try {
        await unlink(to);
      } catch {
        // nothing at the target slot yet
      }
      try {
        await rename(from, to);
      } catch {
        // source slot may not exist yet
      }
    }
    // Compress the active file into slot 1, then reset it.
    try {
      const data = await readFile(this.activePath);
      const compressed = gzipSync(data);
      try {
        await unlink(this.archivePath(1));
      } catch {
        // slot 1 already empty
      }
      await writeFile(this.archivePath(1), compressed);
    } catch {
      // active file did not exist; nothing to archive
    }
    try {
      await truncate(this.activePath, 0);
    } catch {
      // will be (re)created on the next append
    }
  }
}

let defaultLogger: Logger | null = null;

/** Process-wide logger writing to the default (module-root) logs directory. */
export function getDefaultLogger(): Logger {
  if (!defaultLogger) {
    defaultLogger = new Logger({ logDir: getDefaultLogDir() });
  }
  return defaultLogger;
}
