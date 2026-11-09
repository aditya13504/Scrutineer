// Custom UI bridge resolvers.
import Resolver from '@forge/resolver';
import { webTrigger } from '@forge/api';
import { DEMO_REVIEWERS } from '../demo/dataset';
import { publishEvidencePack } from '../evidence/publish';
import { reviewSuspect } from '../impact/apply';
import { recordBenchRun, recordManual } from '../ingest/record';
import { assignableUsers, canBrowseProject, firstTestKey, getProject, isJiraAdmin } from '../jira/client';
import { ADMIN_RESOLVERS, authorizeAdmin, authorizeProject } from './guards';
import type { ScrutineerProperty } from '../jira/map';
import {
  actorOf, applyFix, createTestFor, draftTest, explainFinding, getIssueTrace, getReadiness, listReleases, resolveProject,
  resolveRelease, setIssueMeta, traceImpact, type FixInput,
} from '../service';
import { signOff } from '../signoff';
import { getDemoStatus, getSettings, getSignoffs, listEvidence, saveSettings, type Settings, type Signoff } from '../store/state';
import { enqueueDemo } from './demo';
import type { TestDraft } from '../drafts/testDraft';
import type { ExecResult } from '../engine/types';

interface Ctx { accountId?: string; extension?: { type?: string; project?: { key: string }; issue?: { key: string } } }
type P = Record<string, unknown>;

const resolver = new Resolver();
const def = (name: string, fn: (payload: P, ctx: Ctx) => Promise<unknown>) =>
  resolver.define(name, async ({ payload, context }) => {
    try {
      if (ADMIN_RESOLVERS.has(name)) await authorizeAdmin(context as Ctx, guardDeps);
      return { ok: true, data: await fn((payload ?? {}) as P, context as Ctx) };
    } catch (e) {
      console.error(`resolver ${name} failed`, e);
      return { ok: false, error: (e as Error).message };
    }
  });
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const guardDeps = { isJiraAdmin, canBrowse: canBrowseProject };
const projectOf = async (p: P, c: Ctx) =>
  authorizeProject(await resolveProject(str(p.projectKey) ?? c.extension?.project?.key ?? c.extension?.issue?.key?.split('-')[0]), guardDeps);
/** For issue-scoped resolvers: the issue's project must be browsable by the caller. */
const issueOf = async (key: unknown) => { const k = String(key ?? '').toUpperCase(); await authorizeProject(k.split('-')[0], guardDeps); return k; };

def('getContextInfo', async (p, c) => {
  const settings = await getSettings();
  const projectKey = c.extension?.project?.key ?? settings.defaultProject;
  const me = await actorOf(c.accountId);
  return { projectKey, me, settings: { defaultProject: settings.defaultProject, evidenceSpaceKey: settings.evidenceSpaceKey, demoProject: settings.demoProject } };
});
def('listReleases', async (p, c) => listReleases(await projectOf(p, c)));
def('getReadiness', async (p, c) => {
  const projectKey = await projectOf(p, c);
  const release = await resolveRelease(projectKey, str(p.release));
  const { snap, gate, hash } = await getReadiness(projectKey, release);
  return { projectKey, release, gate, snap, hash };
});
def('explainFinding', async (p, c) => {
  const projectKey = await projectOf(p, c);
  return explainFinding(projectKey, await resolveRelease(projectKey, str(p.release)), String(p.findingId));
});
def('traceImpact', async (p, c) => traceImpact(await projectOf(p, c), String(p.issueKey)));
def('getIssueTrace', async (p, c) => getIssueTrace(await issueOf(p.issueKey ?? c.extension?.issue?.key)));
def('draftTest', async (p, c) => draftTest(await projectOf(p, c), String(p.requirementKey)));
def('createTest', async (p, c) => {
  const projectKey = await projectOf(p, c);
  return createTestFor(projectKey, await resolveRelease(projectKey, str(p.release)), String(p.requirementKey), p.draft as TestDraft);
});
def('applyFix', async (p, c) => {
  const projectKey = await projectOf(p, c);
  return applyFix(projectKey, await resolveRelease(projectKey, str(p.release)), String(p.findingId), (p.input ?? {}) as FixInput, await actorOf(c.accountId));
});
def('recordManualResult', async (p, c) => {
  const actor = await actorOf(c.accountId);
  if (p.result !== 'Passed' && p.result !== 'Failed') throw new Error('Result must be Passed or Failed.');
  if (!str(p.version)) throw new Error('Choose the release the test ran on.');
  return recordManual(await issueOf(p.testKey), String(p.version), p.result as Exclude<ExecResult, 'NotRun'>, actor.name, str(p.note));
});
def('runBench', async (p, c) => {
  const settings = await getSettings();
  const testKey = await issueOf(p.testKey);
  if (settings.demoProject !== testKey.split('-')[0]) throw new Error('The simulated bench is only available in the demo project.');
  return recordBenchRun(testKey, String(p.version), (await actorOf(c.accountId)).name);
});
def('resolveSuspect', async (p, c) => {
  await reviewSuspect(await issueOf(p.testKey), str(p.upstreamKey), (await actorOf(c.accountId)).name, String(p.justification ?? ''));
  return { ok: true };
});
def('setIssueMeta', async (p, c) => setIssueMeta(await issueOf(p.issueKey), (p.patch ?? {}) as Partial<ScrutineerProperty>, await actorOf(c.accountId)));
def('publishEvidence', async (p, c) => {
  const projectKey = await projectOf(p, c);
  const settings = await getSettings();
  const space = str(p.spaceKey) ?? settings.evidenceSpaceKey;
  if (!space) throw new Error('Choose a Confluence space for evidence packs in Scrutineer settings.');
  return publishEvidencePack(projectKey, await resolveRelease(projectKey, str(p.release)), space, (await actorOf(c.accountId)).name);
});
def('listEvidence', async (p, c) => {
  const projectKey = await projectOf(p, c);
  return listEvidence(projectKey, str(p.release));
});
def('signOff', async (p, c) => {
  const projectKey = await projectOf(p, c);
  const actor = await actorOf(c.accountId);
  return signOff(projectKey, await resolveRelease(projectKey, str(p.release)), p.role as Signoff['role'], actor.accountId, actor.name);
});
def('listSignoffs', async (p, c) => {
  const projectKey = await projectOf(p, c);
  return getSignoffs(projectKey, await resolveRelease(projectKey, str(p.release)));
});
def('getSettings', async () => {
  const s = await getSettings();
  return { ...s, ingestToken: undefined };
});
def('saveSettings', async (p) => {
  const patch = p as Partial<Settings>;
  if (patch.defaultProject && !(await getProject(patch.defaultProject))) throw new Error(`Project ${patch.defaultProject} not found.`);
  const s = await saveSettings({ defaultProject: patch.defaultProject, evidenceSpaceKey: patch.evidenceSpaceKey, roleFallback: patch.roleFallback ?? (await getSettings()).roleFallback });
  return { ...s, ingestToken: undefined };
});
def('getIngestInfo', async () => {
  const s = await getSettings();
  let url = '';
  try { url = await webTrigger.getUrl('results-ingest'); } catch (e) { url = `(unavailable: ${(e as Error).message})`; }
  let exampleTestKey: string | undefined;
  if (s.defaultProject) { try { exampleTestKey = await firstTestKey(s.defaultProject); } catch { /* example only */ } }
  return { url, token: s.ingestToken, projectKey: s.defaultProject, exampleTestKey };
});
def('reviewerOptions', async (p, c) => {
  const projectKey = await projectOf(p, c);
  let users: { accountId: string; displayName: string }[] = [];
  try { users = await assignableUsers(projectKey); } catch { /* fall back to demo reviewers */ }
  const settings = await getSettings();
  const demo = settings.demoProject === projectKey ? Object.entries(DEMO_REVIEWERS).map(([accountId, displayName]) => ({ accountId, displayName })) : [];
  return [...demo, ...users.map((u) => ({ accountId: u.accountId, displayName: u.displayName }))];
});
def('loadDemo', async (p, c) => { await enqueueDemo({ action: 'load', accountId: c.accountId ?? '', projectKey: str(p.projectKey) }); return { queued: true }; });
def('resetDemo', async (_p, c) => { await enqueueDemo({ action: 'reset', accountId: c.accountId ?? '' }); return { queued: true }; });
def('getDemoStatus', async () => getDemoStatus());

export const handler = resolver.getDefinitions();
