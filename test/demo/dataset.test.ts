import { describe, it, expect } from 'vitest';
import { DEMO, demoAsSnapshot, DEMO_DECOYS, DEMO_FIX_TARGETS } from '../../src/demo/dataset';
import { evaluateGate } from '../../src/engine/gate';

describe('demo dataset', () => {
  it('BBW 2.3 fails exactly the four planted findings', () => {
    const g = evaluateGate(demoAsSnapshot('BBW 2.3'));
    const t = DEMO_FIX_TARGETS;
    expect(g.findings.map((f) => f.id).sort()).toEqual(
      [`R4:${t.missingTestReq}`, `R6:${t.suspectTest}`, `R8:${t.defect}`, `R7:${t.selfReviewedImpl}`].sort());
    expect(g.findings.filter((f) => f.severity === 'blocking')).toHaveLength(3);
    expect(g.verdict).toBe('NO_GO');
    expect(g.lights).toBe(3);
  });

  it('BBW 2.2 (shipped) is GO', () => {
    const g = evaluateGate(demoAsSnapshot('BBW 2.2'));
    expect(g.findings).toEqual([]);
    expect(g.verdict).toBe('GO');
  });

  it('no finding references a decoy', () => {
    const g = evaluateGate(demoAsSnapshot('BBW 2.3'));
    for (const d of DEMO_DECOYS) expect(g.findings.flatMap((f) => f.keys)).not.toContain(d);
  });

  it('applying the scripted demo fixes turns BBW 2.3 GO with lights out', () => {
    const s = demoAsSnapshot('BBW 2.3');
    const t = DEMO_FIX_TARGETS;
    s.items.TNEW = { key: 'TNEW', role: 'TC', summary: 'Verify: pedal plausibility', status: 'Done', statusCategory: 'done', fixVersions: ['BBW 2.3'], updatedAt: '2026-11-09T00:00:00.000Z' };
    s.links.push({ role: 'verifies', from: 'TNEW', to: t.missingTestReq });
    s.executions.TNEW = [{ result: 'Passed', version: 'BBW 2.3', executedAt: '2026-11-09T10:00:00.000Z', source: 'bench-sim', actor: 'Simulated HIL bench' }];
    s.suspects = s.suspects.map((f) => ({ ...f, resolved: { by: 'review', at: '2026-11-09T10:05:00.000Z', actor: 'Aditya', justification: 'Wording clarified; cross-check threshold unchanged.' } }));
    s.items[t.defect].statusCategory = 'done';
    s.items[t.selfReviewedImpl].reviewerId = 'demo:priya';
    const g = evaluateGate(s);
    expect(g.findings).toEqual([]);
    expect(g.verdict).toBe('GO');
    expect(g.lights).toBe(0);
    expect(g.score).toBe(100);
  });

  it('dataset is internally consistent', () => {
    const refs = new Set(DEMO.issues.map((i) => i.ref));
    expect(refs.size).toBe(DEMO.issues.length);
    for (const l of DEMO.links) { expect(refs.has(l.from)).toBe(true); expect(refs.has(l.to)).toBe(true); }
    for (const e of DEMO.executions) expect(refs.has(e.ref)).toBe(true);
    for (const p of DEMO.pages) for (const r of p.linkTo) expect(refs.has(r)).toBe(true);
    expect(DEMO.issues.filter((i) => i.role === 'HAZ')).toHaveLength(6);
    expect(DEMO.issues.filter((i) => i.role === 'REQ' && i.fixVersions.includes('BBW 2.3')).length).toBeGreaterThanOrEqual(14);
    expect(DEMO.issues.filter((i) => i.role === 'TC').length).toBeGreaterThanOrEqual(16);
    for (const i of DEMO.issues) expect(i.summary.length).toBeLessThanOrEqual(120);
  });
});
