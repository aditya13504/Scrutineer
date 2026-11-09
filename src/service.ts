// Shared orchestration used by UI resolvers, Rovo actions, MCP tools and the validator.
import { draftTestCase, type TestDraft } from './drafts/testDraft';
import { createLinkedTest } from './drafts/create';
import { evaluateGate } from './engine/gate';
import { getProfile } from './engine/profiles';
import { badge, type FixType, type Finding, type TraceItem, type TraceSnapshot } from './engine/types';
import { hashSnapshot } from './evidence/render';
import { applyChangeImpact, reviewSuspect } from './impact/apply';
import { downstream, upstream } from './impact/impact';
import { recordBenchRun } from './ingest/record';
import { getUser, listVersions, patchIssueProperty, projectsWithVersion, transitionToDone } from './jira/client';
import type { ScrutineerProperty } from './jira/map';
import { buildSnapshot } from './snapshot/build';
import { getSettings, putStoredSnapshot } from './store/state';

export interface Actor { accountId: string; name: string }

export async function actorOf(accountId: string | undefined): Promise<Actor> {
  if (!accountId) return { accountId: 'unknown', name: 'Unknown user' };
  try { return { accountId, name: (await getUser(accountId)).displayName }; } catch { return { accountId, name: 'Jira user' }; }
}

export async function resolveProject(input?: string | null, release?: string | null): Promise<string> {
  if (input && String(input).trim()) return String(input).trim().toUpperCase();
  const s = await getSettings();
  if (s.defaultProject) return s.defaultProject;
  // No default visible here: a release name like "BBW 2.3" usually belongs to exactly one project.
  const rel = release?.trim();
  if (rel) {
    const keys = await projectsWithVersion(rel);
    if (keys.length === 1) return keys[0];
    if (keys.length > 1) throw new Error(`Release "${rel}" exists in several projects (${keys.join(', ')}). Name the project.`);
  }
  throw new Error('No project. Load the demo or set a default project in Scrutineer settings.');
}

export async function resolveRelease(projectKey: string, input?: string | null): Promise<string> {
  if (input && String(input).trim()) return String(input).trim();
  const v = (await listVersions(projectKey)).find((x) => !x.released && !x.archived);
  if (!v) throw new Error(`Project ${projectKey} has no unreleased version. Create a fix version for the release you want to check.`);
  return v.name;
}

export async function listReleases(projectKey: string) {
  return (await listVersions(projectKey)).filter((v) => !v.archived).map((v) => ({ id: v.id, name: v.name, released: v.released }));
}

export async function getReadiness(projectKey: string, release: string) {
  const snap = await buildSnapshot(projectKey, release);
  const gate = evaluateGate(snap, getProfile(snap.profileId || 'iso26262'));
  const hash = hashSnapshot(snap, gate);
  await putStoredSnapshot(projectKey, release, { gate, hash, at: snap.takenAt });
  return { snap, gate, hash };
}

export const HOW_TO_FIX: Record<FixType, string> = {
  create_test: 'Create a test case that verifies this requirement, link it with "verifies", and record a passing result on the release.',
  create_requirement: 'Write a safety requirement that mitigates this hazard and link it with "mitigates".',
  trace_up: 'Link the requirement to the hazard it mitigates, or to the safety decision it is derived from.',
  complete_implementation: 'Link an implementation item with "implements" and complete it.',
  run_test: 'Run the test on this release (CI or HIL bench) and record the result.',
  resolve_suspect: 'Re-run the test after the upstream change, or record an impact review explaining why the test is still valid.',
  assign_reviewer: 'Assign an independent reviewer (not the assignee) and record the review.',
  resolve_defect: 'Fix and close the defect, or remove the blocking link if it does not affect this requirement.',
  review_asil: 'Confirm the requirement ASIL, or mark it as decomposed if ASIL decomposition was applied.',
  add_scope: 'Set this fix version on the safety requirements delivered in the release.',
};

function findOpen(gate: ReturnType<typeof evaluateGate>, id: string): Finding {
  const f = gate.findings.find((x) => x.id === id);
  if (!f) throw new Error(`Finding ${id} is no longer open. Refresh the Control Room.`);
  return f;
}

export async function explainFinding(projectKey: string, release: string, findingIdOrKey: string) {
  const { snap, gate } = await getReadiness(projectKey, release);
  const f = gate.findings.find((x) => x.id === findingIdOrKey) ?? gate.findings.find((x) => x.keys.includes(findingIdOrKey.toUpperCase()));
  if (!f) {
    const item = snap.items[findingIdOrKey.toUpperCase()];
    return { finding: null, summary: item ? `${badge(item)} has no open findings on ${release}.` : `No open finding matches ${findingIdOrKey} on ${release}.` };
  }
  const rule = getProfile(snap.profileId || 'iso26262').rules.find((r) => r.id === f.ruleId)!;
  const evidence = f.keys.map((k) => snap.items[k]).filter(Boolean);
  return {
    finding: f, rule: { id: rule.id, title: rule.title, clause: rule.clause, severity: rule.severity }, evidence, howToFix: HOW_TO_FIX[f.fix],
    summary: `${f.message} Rule ${rule.id} (${rule.title}, ${rule.clause}). Fix: ${HOW_TO_FIX[f.fix]}`,
  };
}

const brief = (i: TraceItem) => ({ key: i.key, role: i.role, label: badge(i), summary: i.summary, status: i.status, asil: i.asil });

export async function traceImpact(projectKey: string, key: string) {
  const snap = await buildSnapshot(projectKey, '');
  const k = key.toUpperCase();
  const item = snap.items[k];
  if (!item) throw new Error(`${k} is not part of the Scrutineer trace (no role set).`);
  const down = downstream(snap, k);
  const up = upstream(snap, k);
  const flaggable = ['HAZ', 'REQ', 'DEC'].includes(item.role) ? down.tests : [];
  return {
    item: brief(item), upstream: up.map((x) => brief(snap.items[x])), downstream: down.items.map((x) => brief(snap.items[x])), wouldFlag: flaggable,
    summary: `${badge(item)}: ${up.length} upstream and ${down.items.length} downstream item(s). Changing it would mark ${flaggable.length} test case(s) suspect${flaggable.length ? `: ${flaggable.map((t) => badge(snap.items[t])).join(', ')}` : ''}.`,
  };
}

export async function getIssueTrace(issueKey: string) {
  const projectKey = issueKey.split('-')[0];
  const snap = await buildSnapshot(projectKey, '');
  const item = snap.items[issueKey];
  if (!item) return { item: null, projectKey };
  const linksOut = snap.links.filter((l) => l.from === issueKey).map((l) => ({ role: l.role, direction: 'out' as const, other: brief(snap.items[l.to]) }));
  const linksIn = snap.links.filter((l) => l.to === issueKey).map((l) => ({ role: l.role, direction: 'in' as const, other: brief(snap.items[l.from]) }));
  const settings = await getSettings();
  return {
    projectKey, item, links: [...linksOut, ...linksIn],
    upstream: upstream(snap, issueKey).map((k) => brief(snap.items[k])),
    downstream: downstream(snap, issueKey).items.map((k) => brief(snap.items[k])),
    executions: (snap.executions[issueKey] ?? []).slice().sort((a, b) => (a.executedAt < b.executedAt ? 1 : -1)),
    suspects: snap.suspects.filter((s) => s.testKey === issueKey),
    isDemo: settings.demoProject === projectKey,
  };
}

export async function draftTest(projectKey: string, reqKey: string) {
  const snap = await buildSnapshot(projectKey, '');
  const req = snap.items[reqKey.toUpperCase()];
  if (!req || req.role !== 'REQ') throw new Error(`${reqKey} is not a safety requirement.`);
  return { requirement: brief(req), draft: draftTestCase(req) };
}

export async function createTestFor(projectKey: string, release: string, reqKey: string, draft: TestDraft) {
  const snap = await buildSnapshot(projectKey, release);
  const req = snap.items[reqKey.toUpperCase()];
  if (!req || req.role !== 'REQ') throw new Error(`${reqKey} is not a safety requirement.`);
  const settings = await getSettings();
  const key = await createLinkedTest(projectKey, req, draft, release, settings.demoProject === projectKey);
  return { createdKey: key, message: `Created TC ${key} and linked it: verifies ${badge(req)}. It is "Not run" until a result is recorded.` };
}

export interface FixInput { draft?: TestDraft; justification?: string; reviewerId?: string; reviewerName?: string }

export async function applyFix(projectKey: string, release: string, findingId: string, input: FixInput, actor: Actor) {
  const snap: TraceSnapshot = await buildSnapshot(projectKey, release);
  const f = findOpen(evaluateGate(snap), findingId);
  const target = snap.items[f.keys[0]];
  const settings = await getSettings();
  switch (f.fix) {
    case 'create_test': {
      const r = await createTestFor(projectKey, release, target.key, input.draft ?? draftTestCase(target));
      return { ok: true, ...r };
    }
    case 'run_test': {
      if (settings.demoProject !== projectKey) throw new Error('Simulated bench runs are only available in the demo project. Record a CI or manual result instead.');
      const e = await recordBenchRun(target.key, release, actor.name);
      return { ok: true, message: `Simulated HIL bench run recorded for ${badge(target)}: ${e.result}.` };
    }
    case 'resolve_suspect': {
      await reviewSuspect(target.key, undefined, actor.name, input.justification ?? '');
      return { ok: true, message: `Impact review recorded for ${badge(target)} by ${actor.name}.` };
    }
    case 'assign_reviewer': {
      if (!input.reviewerId) throw new Error('Choose an independent reviewer.');
      if (input.reviewerId === target.assigneeId) throw new Error('The reviewer must be someone other than the assignee.');
      await patchIssueProperty(target.key, { reviewerId: input.reviewerId, reviewerName: input.reviewerName }, 'user');
      return { ok: true, message: `${input.reviewerName ?? 'Reviewer'} recorded as independent reviewer of ${badge(target)}.` };
    }
    case 'resolve_defect': {
      const status = await transitionToDone(target.key, 'user');
      return { ok: true, message: `${badge(target)} moved to ${status}.` };
    }
    default:
      throw new Error(`No one-click fix for ${f.ruleId}. ${HOW_TO_FIX[f.fix]}`);
  }
}

export async function setIssueMeta(issueKey: string, patch: Partial<ScrutineerProperty>, actor: Actor) {
  const projectKey = issueKey.split('-')[0];
  const before = await buildSnapshot(projectKey, '');
  const prev = before.items[issueKey];
  const next = await patchIssueProperty(issueKey, patch, 'user');
  let flagged: string[] = [];
  const role = next.role ?? prev?.role;
  if (prev && patch.asil && patch.asil !== prev.asil && role && ['HAZ', 'REQ', 'DEC'].includes(role)) {
    flagged = await applyChangeImpact(projectKey, issueKey, actor.name, new Date().toISOString(), ['asil']);
  }
  return { property: next, flagged };
}
