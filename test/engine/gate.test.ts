import { describe, it, expect } from 'vitest';
import { evaluateGate } from '../../src/engine/gate';
import { getProfile, PROFILES } from '../../src/engine/profiles';
import { mkSnap, add, link, item, passed, REL } from './fixtures';

const ids = (snap: ReturnType<typeof mkSnap>) => evaluateGate(snap).findings.map((f) => f.id).sort();

describe('evaluateGate — ISO 26262', () => {
  it('fully traced release → GO, lights 0, score 100', () => {
    const g = evaluateGate(mkSnap());
    expect(g.findings).toEqual([]);
    expect(g.verdict).toBe('GO');
    expect(g.lights).toBe(0);
    expect(g.score).toBe(100);
    expect(g.scope).toEqual(['R1']);
  });

  it('R0: empty scope → NO_GO with only R0 (Review Focus 1)', () => {
    const s = mkSnap();
    s.release = 'BBW 9.9';
    const g = evaluateGate(s);
    expect(g.findings.map((f) => f.id)).toEqual(['R0:BBW 9.9']);
    expect(g.verdict).toBe('NO_GO');
    expect(g.score).toBe(0);
    expect(g.lights).toBe(1);
  });

  it('R1: ASIL hazard without mitigating requirement', () => {
    const s = add(mkSnap(), item('H2', 'HAZ', { asil: 'B' }));
    const g = evaluateGate(s);
    const f = g.findings.find((x) => x.ruleId === 'R1')!;
    expect(f).toMatchObject({ id: 'R1:H2', severity: 'blocking', keys: ['H2'], fix: 'create_requirement' });
    expect(f.message).toContain('HAZ H2');
  });

  it('R1: QM hazard needs no requirement', () => {
    const s = add(mkSnap(), item('H2', 'HAZ', { asil: 'QM' }));
    expect(ids(s)).toEqual([]);
  });

  it('R1: hazard mitigated only by a superseded requirement still fails', () => {
    const s = add(mkSnap(), item('H2', 'HAZ', { asil: 'C' }), item('R9', 'REQ', { superseded: true, asil: 'C' }));
    link(s, 'mitigates', 'R9', 'H2');
    expect(ids(s)).toEqual(['R1:H2']);
  });

  it('R2: requirement with no upward trace (major)', () => {
    const s = mkSnap();
    s.links = s.links.filter((l) => l.role !== 'mitigates');
    s.items.H1.fixVersions = []; // hazard no longer in scope
    const g = evaluateGate(s);
    expect(g.findings.map((f) => f.id)).toEqual(['R2:R1']);
    expect(g.findings[0]).toMatchObject({ severity: 'major', fix: 'trace_up' });
    expect(g.verdict).toBe('AT_RISK');
    expect(g.lights).toBe(5);
  });

  it('R2: derivedFrom a decision counts as upward trace', () => {
    const s = mkSnap();
    s.links = s.links.filter((l) => l.role !== 'mitigates');
    s.items.H1.fixVersions = [];
    add(s, item('D1', 'DEC'));
    link(s, 'derivedFrom', 'R1', 'D1');
    expect(ids(s)).toEqual([]);
  });

  it('R3: requirement without implementation', () => {
    const s = mkSnap();
    s.links = s.links.filter((l) => l.role !== 'implements');
    expect(ids(s)).toEqual(['R3:R1']);
  });

  it('R3: implementation not done', () => {
    const s = mkSnap();
    s.items.I1.statusCategory = 'indeterminate';
    s.items.I1.status = 'In Progress';
    const f = evaluateGate(s).findings;
    expect(f.map((x) => x.id)).toEqual(['R3:R1']);
    expect(f[0].keys).toEqual(['R1', 'I1']);
  });

  it('R4: requirement without verifying test', () => {
    const s = mkSnap();
    s.links = s.links.filter((l) => l.role !== 'verifies');
    const f = evaluateGate(s).findings;
    expect(f.map((x) => x.id)).toEqual(['R4:R1']);
    expect(f[0]).toMatchObject({ severity: 'blocking', fix: 'create_test' });
    expect(f[0].message).toBe('REQ R1 has no verifying test case.');
  });

  it('R5: passed on 2.2 only → R5 on 2.3 (Review Focus 2)', () => {
    const s = mkSnap();
    s.executions.T1 = [passed('BBW 2.2')];
    expect(ids(s)).toEqual(['R5:T1']);
  });

  it('R5: latest execution on the release decides (failed after passed)', () => {
    const s = mkSnap();
    s.executions.T1 = [passed(), { ...passed(REL, '2026-11-03T10:00:00.000Z'), result: 'Failed' }];
    expect(ids(s)).toEqual(['R5:T1']);
  });

  it('R5: never executed', () => {
    const s = mkSnap();
    s.executions = {};
    expect(ids(s)).toEqual(['R5:T1']);
  });

  it('R6: unresolved suspect blocks', () => {
    const s = mkSnap();
    s.suspects = [{ testKey: 'T1', upstreamKey: 'R1', changedAt: '2026-11-04T10:00:00.000Z', changedBy: 'carol', reason: 'upstream REQ R1 changed (summary)' }];
    const f = evaluateGate(s).findings;
    expect(f.map((x) => x.id)).toEqual(['R6:T1']);
    expect(f[0].keys).toEqual(['T1', 'R1']);
  });

  it('R6: suspect followed by a later re-run clears (Review Focus 3)', () => {
    const s = mkSnap();
    s.suspects = [{ testKey: 'T1', upstreamKey: 'R1', changedAt: '2026-11-04T10:00:00.000Z', changedBy: 'carol', reason: 'x' }];
    s.executions.T1.push(passed(REL, '2026-11-05T10:00:00.000Z'));
    expect(ids(s)).toEqual([]);
  });

  it('R6: suspect resolved by review clears', () => {
    const s = mkSnap();
    s.suspects = [{ testKey: 'T1', upstreamKey: 'R1', changedAt: '2026-11-04T10:00:00.000Z', changedBy: 'carol', reason: 'x',
      resolved: { by: 'review', at: '2026-11-04T11:00:00.000Z', actor: 'dave', justification: 'Wording only; behaviour unchanged.' } }];
    expect(ids(s)).toEqual([]);
  });

  it('R7: ASIL D implementation reviewed by its own assignee (major)', () => {
    const s = mkSnap();
    s.items.I1.reviewerId = 'alice';
    const f = evaluateGate(s).findings;
    expect(f.map((x) => x.id)).toEqual(['R7:I1']);
    expect(f[0]).toMatchObject({ severity: 'major', fix: 'assign_reviewer' });
  });

  it('R7: missing reviewer on ASIL C; ignored for ASIL B', () => {
    const s = mkSnap();
    s.items.I1.reviewerId = undefined;
    s.items.R1.asil = 'C';
    expect(ids(s)).toEqual(['R7:I1']);
    s.items.R1.asil = 'B';
    s.items.H1.asil = 'B';
    expect(ids(s)).toEqual([]);
  });

  it('R8: open defect blocking a scope requirement', () => {
    const s = add(mkSnap(), item('X1', 'DEF', { statusCategory: 'new', status: 'Open' }));
    link(s, 'blocks', 'X1', 'R1');
    const f = evaluateGate(s).findings;
    expect(f.map((x) => x.id)).toEqual(['R8:X1']);
    expect(f[0].keys).toEqual(['X1', 'R1']);
    s.items.X1.statusCategory = 'done';
    expect(ids(s)).toEqual([]);
  });

  it('R9: requirement ASIL above its hazards (minor), unless decomposed', () => {
    const s = mkSnap();
    s.items.H1.asil = 'B';
    expect(ids(s)).toEqual(['R9:R1']);
    expect(evaluateGate(s).findings[0].severity).toBe('minor');
    s.items.R1.decomposed = true;
    expect(ids(s)).toEqual([]);
  });

  it('superseded requirement is out of scope', () => {
    const s = add(mkSnap(), item('R9', 'REQ', { superseded: true }));
    const g = evaluateGate(s);
    expect(g.scope).toEqual(['R1']);
    expect(g.findings).toEqual([]);
  });

  it('duplicate links, self links and multi-verify → unique, stable ids (Review Focus 4)', () => {
    const s = add(mkSnap(), item('R2', 'REQ', { asil: 'D' }));
    link(s, 'verifies', 'T1', 'R1'); // duplicate
    link(s, 'verifies', 'T1', 'T1'); // self
    link(s, 'verifies', 'T1', 'R2'); // T1 verifies two requirements
    link(s, 'mitigates', 'R2', 'H1');
    s.executions.T1 = [passed('BBW 2.2')]; // T1 fails R5 once, not twice
    const g = evaluateGate(s);
    const allIds = g.findings.map((f) => f.id);
    expect(new Set(allIds).size).toBe(allIds.length);
    expect(allIds.sort()).toEqual(['R3:R2', 'R5:T1']);
    expect(evaluateGate(s).findings.map((f) => f.id)).toEqual(g.findings.map((f) => f.id));
  });

  it('NO_GO lights reflect blocking count, capped at 5', () => {
    const s = mkSnap();
    for (let i = 2; i <= 8; i++) add(s, item(`H${i}`, 'HAZ', { asil: 'A' }));
    const g = evaluateGate(s);
    expect(g.verdict).toBe('NO_GO');
    expect(g.lights).toBe(5);
  });

  it('score reflects partial coverage', () => {
    const s = mkSnap();
    s.executions = {};
    const g = evaluateGate(s);
    expect(g.score).toBe(65); // tests passing term (0.35) lost
    expect(g.stats).toMatchObject({ requirements: 1, requirementsVerified: 1, tests: 1, testsPassing: 0, hazards: 1, hazardsMitigated: 1 });
  });

  it('profiles registry exposes iso26262 with 10 rules', () => {
    expect(PROFILES.map((p) => p.id)).toEqual(['iso26262']);
    expect(getProfile('iso26262').rules.map((r) => r.id)).toEqual(['R0', 'R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9']);
    expect(() => getProfile('nope')).toThrow(/Unknown profile/);
  });

  it('engine accepts a custom profile (profiles are data)', () => {
    const custom = { ...getProfile('iso26262'), id: 'test-profile', rules: getProfile('iso26262').rules.filter((r) => r.id === 'R4') };
    const s = mkSnap();
    s.links = s.links.filter((l) => l.role !== 'verifies');
    s.executions = {};
    expect(evaluateGate(s, custom).findings.map((f) => f.id)).toEqual(['R4:R1']);
  });
});
