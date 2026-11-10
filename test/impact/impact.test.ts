import { describe, it, expect } from 'vitest';
import { downstream, upstream, flagsForChange, mergeFlags, resolveByReview } from '../../src/impact/impact';
import { mkSnap, add, link, item } from '../engine/fixtures';

const AT = '2026-11-06T09:00:00.000Z';

function graph() {
  // H1 <- R1 <- T1, I1 ; R2 derivedFrom R1 ; T2 verifies R2 ; D1 <- R1 (derivedFrom)
  const s = add(mkSnap(), item('R2', 'REQ'), item('T2', 'TC'), item('D1', 'DEC'));
  link(s, 'derivedFrom', 'R2', 'R1');
  link(s, 'verifies', 'T2', 'R2');
  link(s, 'derivedFrom', 'R1', 'D1');
  return s;
}

describe('impact', () => {
  it('HAZ change flags tests two levels down', () => {
    const s = graph();
    expect(downstream(s, 'H1').tests).toEqual(['T1', 'T2']);
    const f = flagsForChange(s, 'H1', 'carol', AT, ['summary']);
    expect(f.map((x) => x.testKey)).toEqual(['T1', 'T2']);
    expect(f[0]).toMatchObject({ upstreamKey: 'H1', changedBy: 'carol', changedAt: AT, reason: 'upstream HAZ H1 changed (summary)' });
  });

  it('REQ change flags its verifying tests and derived requirement tests', () => {
    const s = graph();
    expect(flagsForChange(s, 'R2', 'c', AT, ['description']).map((x) => x.testKey)).toEqual(['T2']);
    expect(downstream(s, 'R1').items).toEqual(['I1', 'R2', 'T1', 'T2']);
  });

  it('DEC change flags tests of derived requirements', () => {
    expect(flagsForChange(graph(), 'D1', 'c', AT, ['summary']).map((x) => x.testKey)).toEqual(['T1', 'T2']);
  });

  it('IMP change → no flags', () => {
    expect(flagsForChange(graph(), 'I1', 'c', AT, ['summary'])).toEqual([]);
  });

  it('assignee-only change → no flags; asil change counts', () => {
    expect(flagsForChange(graph(), 'R1', 'c', AT, ['assignee'])).toEqual([]);
    expect(flagsForChange(graph(), 'R1', 'c', AT, ['asil', 'assignee'])[0].reason).toBe('upstream REQ R1 changed (asil)');
  });

  it('upstream walks the reverse direction', () => {
    expect(upstream(graph(), 'T2')).toEqual(['D1', 'H1', 'R1', 'R2']);
  });

  it('mergeFlags does not duplicate an unresolved upstream/test pair but re-flags after resolution', () => {
    const s = graph();
    const first = flagsForChange(s, 'R1', 'c', AT, ['summary']).filter((f) => f.testKey === 'T1');
    const merged = mergeFlags(first, flagsForChange(s, 'R1', 'c', '2026-11-07T00:00:00.000Z', ['summary']).filter((f) => f.testKey === 'T1'));
    expect(merged.added).toBe(0);
    expect(merged.refreshed).toBe(1); // a newer change to an open flag counts as a refresh
    expect(merged.flags).toHaveLength(1);
    const resolved = resolveByReview(merged.flags, 'R1', 'dave', 'Wording only.', '2026-11-07T01:00:00.000Z');
    const again = mergeFlags(resolved, flagsForChange(s, 'R1', 'c', '2026-11-08T00:00:00.000Z', ['summary']).filter((f) => f.testKey === 'T1'));
    expect(again.added).toBe(1);
    expect(again.flags).toHaveLength(2);
  });

  it('resolveByReview requires a justification', () => {
    const flags = flagsForChange(graph(), 'R1', 'c', AT, ['summary']).filter((f) => f.testKey === 'T1');
    expect(() => resolveByReview(flags, 'R1', 'dave', '   ', AT)).toThrow(/justification/i);
    const r = resolveByReview(flags, undefined, 'dave', 'Checked', AT);
    expect(r[0].resolved).toEqual({ by: 'review', at: AT, actor: 'dave', justification: 'Checked' });
  });
});
