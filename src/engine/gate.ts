import { buildContext } from './context';
import { ISO26262 } from './iso26262';
import type { GateResult, GateStats, Profile, TraceSnapshot, Verdict } from './types';

const ratio = (num: number, den: number) => (den === 0 ? 1 : num / den);

export function evaluateGate(snap: TraceSnapshot, profile: Profile = ISO26262): GateResult {
  const ctx = buildContext(snap);
  const seen = new Set<string>();
  const findings = profile.rules.flatMap((r) => r.check(ctx)).filter((f) => (seen.has(f.id) ? false : (seen.add(f.id), true)));

  const blocking = findings.filter((f) => f.severity === 'blocking').length;
  const verdict: Verdict = blocking ? 'NO_GO' : findings.length ? 'AT_RISK' : 'GO';
  const lights = verdict === 'NO_GO' ? Math.min(5, Math.max(1, blocking)) : verdict === 'AT_RISK' ? 5 : 0;

  const rel = snap.release;
  const hazards = ctx.scopeHazards.filter((h) => (h.asil ?? 'QM') !== 'QM');
  const hazardsMitigated = hazards.filter((h) => ctx.incoming(h.key, 'mitigates').some((r) => snap.items[r]?.role === 'REQ' && !snap.items[r].superseded)).length;
  const requirementsImplemented = ctx.scopeReqs.filter((r) => {
    const impls = ctx.incoming(r.key, 'implements').filter((k) => snap.items[k]?.role === 'IMP');
    return impls.length > 0 && impls.every((k) => snap.items[k].statusCategory === 'done');
  }).length;
  const requirementsVerified = ctx.scopeReqs.filter((r) => ctx.incoming(r.key, 'verifies').some((k) => snap.items[k]?.role === 'TC')).length;
  const testsPassing = ctx.scopeTests.filter((t) => ctx.latestExec(t.key, rel)?.result === 'Passed').length;
  const suspectTests = new Set(findings.filter((f) => f.ruleId === 'R6').map((f) => f.keys[0]));
  const openBlockers = findings.filter((f) => f.ruleId === 'R8').length;

  const stats: GateStats = {
    hazards: hazards.length, hazardsMitigated,
    requirements: ctx.scopeReqs.length, requirementsImplemented, requirementsVerified,
    tests: ctx.scopeTests.length, testsPassing, suspects: suspectTests.size, openBlockers,
  };

  const reqs = ctx.scopeReqs.length;
  const score = reqs === 0 ? 0 : Math.round(100 * (
    0.15 * ratio(hazardsMitigated, hazards.length) +
    0.15 * ratio(requirementsImplemented, reqs) +
    0.2 * ratio(requirementsVerified, reqs) +
    0.35 * ratio(testsPassing, ctx.scopeTests.length) +
    0.15 * ratio(ctx.scopeTests.length - suspectTests.size, ctx.scopeTests.length)
  ));

  return { verdict, score, lights, findings, stats, scope: ctx.scopeReqs.map((r) => r.key) };
}
