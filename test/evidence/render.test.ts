import { describe, it, expect } from 'vitest';
import { draftTestCase } from '../../src/drafts/testDraft';
import { hashSnapshot, renderEvidencePack, canonicalJson, sourceHtml } from '../../src/evidence/render';
import { evaluateGate } from '../../src/engine/gate';
import { mkSnap, item } from '../engine/fixtures';
import { demoAsSnapshot } from '../../src/demo/dataset';

describe('draftTestCase', () => {
  it('ASIL D requirement gets nominal, fault-injection and boundary steps', () => {
    const d = draftTestCase(item('R1', 'REQ', { asil: 'D', summary: 'Brake pedal position sensor plausibility check' }));
    expect(d.summary).toBe('Verify: Brake pedal position sensor plausibility check');
    expect(d.asil).toBe('D');
    expect(d.steps.some((s) => /fault injection/i.test(s))).toBe(true);
    expect(d.steps.some((s) => /boundary/i.test(s))).toBe(true);
    expect(d.preconditions.length).toBeGreaterThan(0);
    expect(d.expected).toMatch(/requirement/i);
  });

  it('timing requirement gets a timing measurement step; ASIL A gets no fault injection', () => {
    const d = draftTestCase(item('R11', 'REQ', { asil: 'A', summary: 'Brake lamp activation within 100 ms' }));
    expect(d.steps.some((s) => /timing|latency|ms/i.test(s))).toBe(true);
    expect(d.steps.some((s) => /fault injection/i.test(s))).toBe(false);
  });

  it('truncates very long summaries to fit Jira', () => {
    const d = draftTestCase(item('R1', 'REQ', { summary: 'x'.repeat(300) }));
    expect(d.summary.length).toBeLessThanOrEqual(255);
  });
});

describe('hashSnapshot', () => {
  it('is stable across key order and changes when an execution changes', () => {
    const a = mkSnap();
    const b = JSON.parse(canonicalJson(a));
    const reordered = { ...b, items: Object.fromEntries(Object.entries(b.items).reverse()) };
    expect(hashSnapshot(a, evaluateGate(a))).toBe(hashSnapshot(reordered, evaluateGate(reordered)));
    const c = mkSnap();
    c.executions.T1[0].result = 'Failed';
    expect(hashSnapshot(c, evaluateGate(c))).not.toBe(hashSnapshot(a, evaluateGate(a)));
    expect(hashSnapshot(a, evaluateGate(a))).toMatch(/^[0-9a-f]{64}$/);
  });

  it('ignores takenAt so re-taking an unchanged snapshot gives the same hash', () => {
    const a = mkSnap();
    const b = mkSnap();
    b.takenAt = '2030-01-01T00:00:00.000Z';
    expect(hashSnapshot(a, evaluateGate(a))).toBe(hashSnapshot(b, evaluateGate(b)));
  });
});

describe('renderEvidencePack', () => {
  const ctx = { generatedBy: 'Aditya', signoffs: [], hash: 'abc123', snapshotId: 'snap-1', generatedAt: '2026-11-09T10:30:00.000Z' };

  it('title, matrix rows per scope requirement, source labels, disclaimer', () => {
    const s = demoAsSnapshot('BBW 2.3');
    s.executions.T2 = [{ result: 'Passed', version: 'BBW 2.3', executedAt: '2026-11-09T10:00:00.000Z', source: 'bench-sim', actor: 'Simulated HIL bench (requested by Aditya)' }];
    s.executions.T3 = [{ result: 'Passed', version: 'BBW 2.3', executedAt: '2026-11-09T10:00:00.000Z', source: 'manual', actor: 'Aditya' }];
    const g = evaluateGate(s);
    const { title, storage } = renderEvidencePack(s, g, ctx);
    expect(title).toBe('Scrutineer Evidence Pack — BBW 2.3 — 2026-11-09 10:30 UTC');
    for (const k of g.scope) expect(storage).toContain(`>${k}<`);
    expect(storage).toContain('simulated HIL bench');
    expect(storage).toContain('manual attestation by Aditya');
    expect(storage).toContain('Scrutineer supports evidence gathering. It does not certify compliance.');
    expect(storage).toContain('NO-GO');
    expect(storage).toContain('abc123');
    expect(storage).toContain('Safety Manager');
    expect(storage).toContain('Marta Kowalski'); // suspect history
  });

  it('suspect history stays Open when the only later run is on another version (review C1)', () => {
    const s = demoAsSnapshot('BBW 2.3');
    s.executions.T4 = [...s.executions.T4, { result: 'Passed', version: 'BBW 2.2', executedAt: '2026-11-07T00:00:00.000Z', source: 'ci', actor: 'CI' }];
    const { storage } = renderEvidencePack(s, evaluateGate(s), ctx);
    expect(storage).toContain('<strong>Open</strong>');
  });

  it('escapes XML special characters', () => {
    const s = mkSnap();
    s.items.R1.summary = 'Torque <limit> & "ramp"';
    const { storage } = renderEvidencePack(s, evaluateGate(s), ctx);
    expect(storage).toContain('Torque &lt;limit&gt; &amp; &quot;ramp&quot;');
    expect(storage).not.toContain('<limit>');
  });

  it('GO verdict renders the GO panel and signoffs', () => {
    const s = mkSnap();
    const { storage } = renderEvidencePack(s, evaluateGate(s), { ...ctx, signoffs: [{ role: 'Safety Manager', accountId: 'a', name: 'Priya', at: '2026-11-09T11:00:00.000Z', hash: 'abc123' }] });
    expect(storage).toContain('GO');
    expect(storage).not.toContain('NO-GO');
    expect(storage).toContain('Priya');
  });
});

describe('sourceHtml (live: raw CI URLs stretched the matrix off the page)', () => {
  const base = { result: 'Passed' as const, version: 'V', executedAt: '2026-11-05T00:00:00Z', actor: 'CI (HIL pipeline #1180)' };
  it('renders an http(s) reference as a short "run log" link', () => {
    const h = sourceHtml({ ...base, source: 'ci', reference: 'https://ci.example.com/hil/1180?a=1&b=2' });
    expect(h).toBe('CI (HIL pipeline #1180), <a href="https://ci.example.com/hil/1180?a=1&amp;b=2">run log</a>');
  });
  it('escapes a non-URL reference and never links it', () => {
    const h = sourceHtml({ ...base, source: 'ci', reference: 'javascript:alert(1) <b>' });
    expect(h).toBe('CI (HIL pipeline #1180) — javascript:alert(1) &lt;b&gt;');
  });
  it('keeps the simulated and manual labels', () => {
    expect(sourceHtml({ ...base, source: 'bench-sim' })).toBe('simulated HIL bench');
    expect(sourceHtml({ ...base, source: 'manual', actor: 'Ann & Bo' })).toBe('manual attestation by Ann &amp; Bo');
  });
});
