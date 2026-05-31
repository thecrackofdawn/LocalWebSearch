import { describe, it, expect, vi } from 'vitest';
import { withRetry } from '../src/retry/retry.js';

describe('withRetry', () => {
  it('should succeed on first try', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await withRetry('test', fn, { maxAttempts: 3 });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and eventually succeed', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('success');

    const result = await withRetry('test', fn, { maxAttempts: 3 });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should throw after max attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));

    await expect(withRetry('test', fn, { maxAttempts: 3 }))
      .rejects.toThrow('fail');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should use exponential backoff', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('success');

    const start = Date.now();
    await withRetry('test', fn, { maxAttempts: 3, baseDelay: 100 });
    const elapsed = Date.now() - start;

    // Should have waited: 100ms + 200ms = 300ms minimum
    expect(elapsed).toBeGreaterThanOrEqual(300);
  });
});
