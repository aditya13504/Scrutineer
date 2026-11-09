// Rovo agent actions (also exposed as MCP tools where read-only). Inputs arrive as top-level payload keys.
import { badge, type LinkRole } from '../engine/types';
import { publishEvidencePack } from '../evidence/publish';
import { canBrowseProject, createLink, ensureLinkTypes, isJiraAdmin } from '../jira/client';
import { authorizeProject } from './guards';
import { buildSnapshot } from '../snapshot/build';
import { actorOf, createTestFor, draftTest, explainFinding, getReadiness, resolveProject, resolveRelease, traceImpact } from '../service';
import { getSettings } from '../store/kvs';

interface ActionPayload {
  [k: string]: unknown;
  context?: { jira?: { projectKey?: string; issueKey?: string }; accountId?: string };
}
interface ActionContext { principal?: { accountId?: string }; accountId?: string }

const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const project = async (p: ActionPayload) =>
  authorizeProject(await resolveProject(s(p.projectKey) ?? p.context?.jira?.projectKey ?? p.context?.jira?.issueKey?.split('-')[0]), { isJiraAdmin, canBrowse: canBrowseProject });
const who = (p: ActionPayload, c?: ActionContext) => actorOf(c?.principal?.accountId ?? c?.accountId ?? p.context?.accountId);

async function safe<T>(name: string, fn: () => Promise<T>): Promise<T | { error: string }> {
  try { return await fn(); } catch (e) {
    console.error(`action ${name} failed`, e);
    return { error: (e as Error).message };
  }
}

export const getReleaseReadiness = (p: ActionPayload) => safe('get-release-readiness', async () => {
  const projectKey = await project(p);
  const release = await resolveRelease(projectKey, s(p.release));
  const { gate } = await getReadiness(projectKey, release);
  const blocking = gate.findings.filter((f) => f.severity === 'blocking');
  return {
    projectKey, release, verdict: gate.verdict, readinessScore: gate.score, stats: gate.stats,
    findings: gate.findings.map((f) => ({ id: f.id, rule: f.ruleId, severity: f.severity, message: f.message })),
    summary: `${release} is ${gate.verdict.replace('_', '-')} (readiness ${gate.score}/100). ` +
      (gate.findings.length ? `${blocking.length} blocking, ${gate.findings.length - blocking.length} other finding(s): ${gate.findings.map((f) => f.message).join(' ')}` : 'Every check passed.'),
  };
});

export const listFindings = (p: ActionPayload) => safe('list-findings', async () => {
  const projectKey = await project(p);
  const release = await resolveRelease(projectKey, s(p.release));
  const { gate } = await getReadiness(projectKey, release);
  return { projectKey, release, findings: gate.findings };
});

export const explainFindingAction = (p: ActionPayload) => safe('explain-finding', async () => {
  const projectKey = await project(p);
  const release = await resolveRelease(projectKey, s(p.release));
  const id = s(p.findingId) ?? s(p.issueKey) ?? p.context?.jira?.issueKey;
  if (!id) throw new Error('Give a finding id (like R4:BBW-12) or an issue key.');
  return explainFinding(projectKey, release, id);
});

export const traceImpactAction = (p: ActionPayload) => safe('trace-impact', async () => {
  const key = s(p.issueKey) ?? p.context?.jira?.issueKey;
  if (!key) throw new Error('Give an issue key.');
  return traceImpact(await project({ ...p, projectKey: s(p.projectKey) ?? key.split('-')[0] }), key);
});

export const draftTestCaseAction = (p: ActionPayload) => safe('draft-test-case', async () => {
  const key = s(p.requirementKey);
  if (!key) throw new Error('Give the requirement key.');
  const r = await draftTest(await project({ ...p, projectKey: s(p.projectKey) ?? key.split('-')[0] }), key);
  return { ...r, note: 'This is a draft only. Show it to the user and ask for explicit confirmation before calling create-linked-test.' };
});

export const createLinkedTestAction = (p: ActionPayload) => safe('create-linked-test', async () => {
  const key = s(p.requirementKey);
  if (!key) throw new Error('Give the requirement key.');
  const projectKey = await project({ ...p, projectKey: s(p.projectKey) ?? key.split('-')[0] });
  const release = await resolveRelease(projectKey, s(p.release));
  const base = (await draftTest(projectKey, key)).draft;
  const steps = s(p.steps)?.split('\n').map((x) => x.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean);
  const draft = { ...base, summary: s(p.summary)?.slice(0, 255) ?? base.summary, steps: steps?.length ? steps : base.steps, expected: s(p.expected) ?? base.expected };
  return createTestFor(projectKey, release, key, draft);
});

const LINKABLE: LinkRole[] = ['mitigates', 'implements', 'verifies', 'derivedFrom'];
export const linkIssuesAction = (p: ActionPayload) => safe('link-issues', async () => {
  const from = s(p.fromKey)?.toUpperCase();
  const to = s(p.toKey)?.toUpperCase();
  const role = s(p.linkRole) as LinkRole | undefined;
  if (!from || !to || !role || !LINKABLE.includes(role)) throw new Error(`Give fromKey, toKey and linkRole (one of ${LINKABLE.join(', ')}).`);
  const snap = await buildSnapshot(await project({ ...p, projectKey: from.split('-')[0] }), '');
  const a = snap.items[from];
  const b = snap.items[to];
  if (!a || !b) throw new Error('Both issues must be Scrutineer trace items.');
  await ensureLinkTypes();
  await createLink(role, from, to, 'user');
  return { summary: `Linked: ${badge(a)} ${role === 'derivedFrom' ? 'is derived from' : role} ${badge(b)}.` };
});

export const publishEvidencePackAction = (p: ActionPayload, c?: ActionContext) => safe('publish-evidence-pack', async () => {
  const projectKey = await project(p);
  const release = await resolveRelease(projectKey, s(p.release));
  const space = s(p.spaceKey) ?? (await getSettings()).evidenceSpaceKey;
  if (!space) throw new Error('No evidence space configured. Give spaceKey or set it in Scrutineer settings.');
  const rec = await publishEvidencePack(projectKey, release, space, (await who(p, c)).name);
  return { ...rec, summary: `Published "${rec.title}" (verdict ${rec.verdict.replace('_', '-')}, SHA-256 ${rec.hash.slice(0, 12)}…): ${rec.url}` };
});
