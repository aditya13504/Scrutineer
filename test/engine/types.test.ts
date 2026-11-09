import { describe, it, expect } from 'vitest';
import type { TraceSnapshot } from '../../src/engine/types';
import { ROLES, ASIL_RANK } from '../../src/engine/types';

describe('domain types', () => {
  it('constructs a snapshot literal and exposes role/asil constants', () => {
    const snap: TraceSnapshot = {
      projectKey: 'BBW', release: 'BBW 2.3', profileId: 'iso26262', takenAt: '2026-11-09T00:00:00Z',
      items: { 'BBW-1': { key: 'BBW-1', role: 'REQ', summary: 's', status: 'To Do', statusCategory: 'new', fixVersions: ['BBW 2.3'], updatedAt: '2026-11-09T00:00:00Z' } },
      links: [], executions: {}, suspects: [],
    };
    expect(snap.items['BBW-1'].role).toBe('REQ');
    expect(ROLES).toEqual(['HAZ', 'REQ', 'IMP', 'TC', 'DEF', 'DEC']);
    expect(ASIL_RANK.D).toBeGreaterThan(ASIL_RANK.A);
  });
});
