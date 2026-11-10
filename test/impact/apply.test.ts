import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkSnap, add, link, item } from '../engine/fixtures';

// Live (video prep): editing a requirement whose test was already suspect refreshed the flag silently.
const st = vi.hoisted(() => ({ flags: {} as Record<string, unknown[]>, comments: [] as string[] }));
vi.mock('../../src/snapshot/build', () => ({
  buildSnapshot: async () => {
    const s = mkSnap();
    s.items = {}; s.links = []; s.executions = {}; s.suspects = [];
    add(s, item('R1', 'REQ')); add(s, item('T1', 'TC'));
    link(s, 'verifies', 'T1', 'R1');
    return s;
  },
}));
vi.mock('../../src/jira/client', () => ({ addComment: async (k: string, t: string) => { st.comments.push(`${k}: ${t}`); } }));
vi.mock('../../src/store/state', () => ({
  getSuspects: async (k: string) => st.flags[k] ?? [],
  putSuspects: async (k: string, f: unknown[]) => { st.flags[k] = f; },
}));

import { applyChangeImpact } from '../../src/impact/apply';

beforeEach(() => { st.flags = {}; st.comments = []; });

describe('applyChangeImpact', () => {
  it('flags and comments on a newly suspect test', async () => {
    expect(await applyChangeImpact('P', 'R1', 'Ann', '2026-11-06T09:00:00.000Z', ['description'])).toEqual(['T1']);
    expect(st.comments).toHaveLength(1);
    expect(st.comments[0]).toMatch(/^T1: ⚠ Suspect: upstream REQ R1 changed on 2026-11-06 by Ann/);
  });
  it('comments again when a newer change refreshes a flag that is still open', async () => {
    await applyChangeImpact('P', 'R1', 'Ann', '2026-11-06T09:00:00.000Z', ['description']);
    expect(await applyChangeImpact('P', 'R1', 'Bo', '2026-11-07T09:00:00.000Z', ['summary'])).toEqual(['T1']);
    expect(st.comments).toHaveLength(2);
    expect(st.comments[1]).toMatch(/changed on 2026-11-07 by Bo/);
    expect(st.flags.T1).toHaveLength(1);
  });
  it('stays quiet for a replayed, older event', async () => {
    await applyChangeImpact('P', 'R1', 'Ann', '2026-11-07T09:00:00.000Z', ['description']);
    expect(await applyChangeImpact('P', 'R1', 'Ann', '2026-11-06T09:00:00.000Z', ['description'])).toEqual([]);
    expect(st.comments).toHaveLength(1);
  });
});
