import { describe, it, expect } from 'vitest';
import { existingDataDecision, assertCanStart } from '../../src/demo/policy';

describe('demo load policy (review I3)', () => {
  it('loads when no demo issues exist', () => {
    expect(existingDataDecision(false, 0)).toBe('load');
    expect(existingDataDecision(true, 0)).toBe('load');
  });
  it('reports exists only when a previous load completed', () => {
    expect(existingDataDecision(true, 71)).toBe('exists');
  });
  it('flags an incomplete earlier load instead of claiming it exists', () => {
    expect(existingDataDecision(false, 30)).toBe('incomplete');
  });
  it('refuses to start while another job is running (recent), allows when stale or idle', () => {
    const now = Date.parse('2026-11-09T12:00:00.000Z');
    expect(() => assertCanStart({ state: 'running', steps: [], at: '2026-11-09T11:58:00.000Z' }, now)).toThrow(/already running/);
    expect(() => assertCanStart({ state: 'running', steps: [], at: '2026-11-09T11:30:00.000Z' }, now)).not.toThrow();
    expect(() => assertCanStart({ state: 'failed', steps: [], at: '2026-11-09T11:59:00.000Z' }, now)).not.toThrow();
  });
});
