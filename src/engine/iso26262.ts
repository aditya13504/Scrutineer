import { ASIL_RANK, badge, type Finding, type Profile, type Rule, type RuleContext } from './types';

const isActive = (ctx: RuleContext, key: string) => {
  const i = ctx.snap.items[key];
  return !!i && !i.superseded;
};

const R0: Rule = {
  id: 'R0', severity: 'blocking', title: 'Release has safety scope', clause: 'ISO 26262-8 §6 (requirements management)',
  check: (ctx) => ctx.scopeReqs.length > 0 ? [] : [{
    id: `R0:${ctx.snap.release}`, ruleId: 'R0', severity: 'blocking', keys: [], fix: 'add_scope',
    message: `No safety requirements are in scope for ${ctx.snap.release}. Assign safety requirements to this fix version.`,
  }],
};

const R1: Rule = {
  id: 'R1', severity: 'blocking', title: 'Every ASIL-rated hazard is mitigated', clause: 'ISO 26262-3 §7 / ISO 26262-8 §6',
  check: (ctx) => ctx.scopeHazards
    .filter((h) => (h.asil ?? 'QM') !== 'QM')
    .filter((h) => !ctx.incoming(h.key, 'mitigates').some((r) => ctx.snap.items[r]?.role === 'REQ' && isActive(ctx, r)))
    .map((h) => ({
      id: `R1:${h.key}`, ruleId: 'R1', severity: 'blocking', keys: [h.key], fix: 'create_requirement',
      message: `${badge(h)} (ASIL ${h.asil}) has no safety requirement that mitigates it.`,
    })),
};

const R2: Rule = {
  id: 'R2', severity: 'major', title: 'Every requirement traces upward', clause: 'ISO 26262-8 §6.4.3',
  check: (ctx) => ctx.scopeReqs
    .filter((r) => ctx.outgoing(r.key, 'mitigates').length === 0 && ctx.outgoing(r.key, 'derivedFrom').length === 0)
    .map((r) => ({
      id: `R2:${r.key}`, ruleId: 'R2', severity: 'major', keys: [r.key], fix: 'trace_up',
      message: `${badge(r)} does not trace up to any hazard or safety decision.`,
    })),
};

const R3: Rule = {
  id: 'R3', severity: 'blocking', title: 'Every requirement is implemented', clause: 'ISO 26262-6 §7–9',
  check: (ctx) => {
    const out: Finding[] = [];
    for (const r of ctx.scopeReqs) {
      const impls = ctx.incoming(r.key, 'implements').filter((k) => ctx.snap.items[k]?.role === 'IMP');
      if (impls.length === 0) {
        out.push({ id: `R3:${r.key}`, ruleId: 'R3', severity: 'blocking', keys: [r.key], fix: 'complete_implementation',
          message: `${badge(r)} has no implementation item.` });
        continue;
      }
      const open = impls.filter((k) => ctx.snap.items[k].statusCategory !== 'done');
      if (open.length) {
        out.push({ id: `R3:${r.key}`, ruleId: 'R3', severity: 'blocking', keys: [r.key, ...open], fix: 'complete_implementation',
          message: `${badge(r)} has unfinished implementation: ${open.map((k) => badge(ctx.snap.items[k])).join(', ')}.` });
      }
    }
    return out;
  },
};

const R4: Rule = {
  id: 'R4', severity: 'blocking', title: 'Every requirement is verified', clause: 'ISO 26262-6 §9 / ISO 26262-4 §7',
  check: (ctx) => ctx.scopeReqs
    .filter((r) => !ctx.incoming(r.key, 'verifies').some((k) => ctx.snap.items[k]?.role === 'TC'))
    .map((r) => ({
      id: `R4:${r.key}`, ruleId: 'R4', severity: 'blocking', keys: [r.key], fix: 'create_test',
      message: `${badge(r)} has no verifying test case.`,
    })),
};

const R5: Rule = {
  id: 'R5', severity: 'blocking', title: 'Every verifying test passed on this release', clause: 'ISO 26262-6 §9.4',
  check: (ctx) => {
    const rel = ctx.snap.release;
    const out: Finding[] = [];
    for (const t of ctx.scopeTests) {
      const e = ctx.latestExec(t.key, rel);
      if (e?.result === 'Passed') continue;
      out.push({
        id: `R5:${t.key}`, ruleId: 'R5', severity: 'blocking', keys: [t.key], fix: 'run_test',
        message: e ? `${badge(t)} last result on ${rel} is ${e.result}.` : `${badge(t)} has not been executed on ${rel}.`,
      });
    }
    return out;
  },
};

const R6: Rule = {
  id: 'R6', severity: 'blocking', title: 'No suspect verification links', clause: 'ISO 26262-8 §8 (change management)',
  check: (ctx) => {
    const out: Finding[] = [];
    for (const t of ctx.scopeTests) {
      const execs = ctx.snap.executions[t.key] ?? [];
      const open = ctx.snap.suspects.filter((s) => s.testKey === t.key && !s.resolved && !execs.some((e) => e.executedAt > s.changedAt));
      if (!open.length) continue;
      const ups = [...new Set(open.map((s) => s.upstreamKey))];
      out.push({
        id: `R6:${t.key}`, ruleId: 'R6', severity: 'blocking', keys: [t.key, ...ups], fix: 'resolve_suspect',
        message: `${badge(t)} is suspect: ${ups.map((u) => (ctx.snap.items[u] ? badge(ctx.snap.items[u]) : u)).join(', ')} changed after it last ran.`,
      });
    }
    return out;
  },
};

const R7: Rule = {
  id: 'R7', severity: 'major', title: 'Independent review for ASIL C/D', clause: 'ISO 26262-2 §6.4.7 (confirmation measures)',
  check: (ctx) => {
    const seen = new Set<string>();
    const out: Finding[] = [];
    for (const r of ctx.scopeReqs) {
      if (r.asil !== 'C' && r.asil !== 'D') continue;
      for (const k of ctx.incoming(r.key, 'implements')) {
        const i = ctx.snap.items[k];
        if (!i || i.role !== 'IMP' || seen.has(k)) continue;
        if (i.reviewerId && i.reviewerId !== i.assigneeId) continue;
        seen.add(k);
        out.push({
          id: `R7:${k}`, ruleId: 'R7', severity: 'major', keys: [k, r.key], fix: 'assign_reviewer',
          message: i.reviewerId
            ? `${badge(i)} implements ASIL ${r.asil} ${badge(r)} but was reviewed by its own assignee.`
            : `${badge(i)} implements ASIL ${r.asil} ${badge(r)} but has no independent reviewer.`,
        });
      }
    }
    return out;
  },
};

const R8: Rule = {
  id: 'R8', severity: 'blocking', title: 'No open defects block safety requirements', clause: 'ISO 26262-8 §7',
  check: (ctx) => {
    const scope = new Set(ctx.scopeReqs.map((r) => r.key));
    return Object.values(ctx.snap.items)
      .filter((d) => d.role === 'DEF' && d.statusCategory !== 'done')
      .sort((a, b) => (a.key < b.key ? -1 : 1))
      .flatMap((d) => {
        const blocked = ctx.outgoing(d.key, 'blocks').filter((k) => scope.has(k));
        return blocked.length ? [{
          id: `R8:${d.key}`, ruleId: 'R8', severity: 'blocking' as const, keys: [d.key, ...blocked], fix: 'resolve_defect' as const,
          message: `${badge(d)} is open and blocks ${blocked.map((k) => badge(ctx.snap.items[k])).join(', ')}.`,
        }] : [];
      });
  },
};

const R9: Rule = {
  id: 'R9', severity: 'minor', title: 'Requirement ASIL consistent with hazards', clause: 'ISO 26262-9 §5 (ASIL decomposition)',
  check: (ctx) => ctx.scopeReqs.flatMap((r) => {
    if (r.decomposed || !r.asil) return [];
    const hz = ctx.outgoing(r.key, 'mitigates').map((k) => ctx.snap.items[k]).filter((h) => h?.role === 'HAZ');
    if (!hz.length) return [];
    const max = Math.max(...hz.map((h) => ASIL_RANK[h.asil ?? 'QM']));
    if (ASIL_RANK[r.asil] <= max) return [];
    return [{
      id: `R9:${r.key}`, ruleId: 'R9', severity: 'minor' as const, keys: [r.key, ...hz.map((h) => h.key)], fix: 'review_asil' as const,
      message: `${badge(r)} is rated ASIL ${r.asil}, higher than the hazards it mitigates. Confirm the rating or mark it decomposed.`,
    }];
  }),
};

export const ISO26262: Profile = {
  id: 'iso26262',
  name: 'ISO 26262 (Road vehicles — functional safety)',
  standard: 'ISO 26262:2018',
  rules: [R0, R1, R2, R3, R4, R5, R6, R7, R8, R9],
  roleLabels: { HAZ: 'Hazard', REQ: 'Safety requirement', IMP: 'Implementation', TC: 'Test case', DEF: 'Defect', DEC: 'Safety decision' },
};
