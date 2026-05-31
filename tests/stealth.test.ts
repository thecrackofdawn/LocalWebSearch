import { describe, it, expect } from 'vitest';
import { applyStealth, stealthArgs } from '../src/browser/stealth.js';

describe('Stealth Configuration', () => {
  it('should export stealth args', () => {
    expect(stealthArgs).toContain('--disable-blink-features=AutomationControlled');
  });

  it('should have stealth function defined', () => {
    expect(typeof applyStealth).toBe('function');
  });
});
