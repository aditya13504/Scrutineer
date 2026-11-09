// Scrutineer state.
//
// Forge runs each product installation (Jira, Confluence) with its own KVS, and Rovo or MCP calls may run in
// either. So everything that must look the same from every surface lives in Jira:
//   - test executions and suspect flags: issue properties on the test case (scrutineer.exec, scrutineer.suspects)
//   - sign-offs and evidence records: project properties (scrutineer.signoffs, scrutineer.evidence)
//   - shared settings: a Forge app property in Jira (scrutineer.settings)
// Forge KVS keeps only context-local data: the ingest token, the readiness cache, immutable evidence
// snapshots and demo bookkeeping. The app makes no outbound calls.
import { kvs, WhereConditions } from '@forge/kvs';
import type { Execution, GateResult, Role, SuspectFlag, TraceSnapshot } from '../engine/types';
import { getAppProp, getIssueProp, getProjectProp, setAppProp, setIssueProp, setProjectProp } from '../jira/client';
import { EXEC_PROP, readListProp, SUSPECT_PROP, type JiraIssue } from '../jira/map';

export interface Settings {
  defaultProject?: string;
  evidenceSpaceKey?: string;
  demoProject?: string;
  roleFallback: Record<string, Role>;
  ingestToken: string;
  profileId: 'iso26262';
}
export interface StoredSnapshot { snap?: TraceSnapshot; gate: GateResult; hash: string; at: string }
export interface EvidenceRecord { url: string; title: string; hash: string; verdict: GateResult['verdict']; at: string; by: string; release: string; snapshotId: string }
export interface Signoff { role: 'Safety Manager' | 'Test Lead' | 'Release Manager'; accountId: string; name: string; at: string; hash: string }
export interface DemoStatus { state: 'idle' | 'running' | 'created' | 'exists' | 'partial' | 'failed' | 'reset'; projectKey?: string; steps: { name: string; ok: boolean; detail?: string }[]; at: string }

/** Jira entity properties are capped at 32 KB, so keep the newest entries. */
export const MAX_EXECUTIONS = 50;
export const MAX_SUSPECTS = 30;
export const MAX_EVIDENCE = 100;
const SETTINGS_PROP = 'scrutineer.settings';
const SIGNOFF_PROP = 'scrutineer.signoffs';
const EVIDENCE_PROP = 'scrutineer.evidence';

const K = {
  snap: (p: string, r: string) => `snap:${p}:${r}:latest`,
  settings: 'settings',
  demo: 'demo:status',
};

// KVS keys allow a limited charset; release names contain spaces and dots, which are allowed.
const safe = (s: string) => s.replace(/[^a-zA-Z0-9:._\s\-#]/g, '_');

// ---- Settings: shared part in Jira, ingest token local to the Jira installation that owns the web trigger.

type SharedSettings = Omit<Settings, 'ingestToken'>;
const SHARED_KEYS = ['defaultProject', 'evidenceSpaceKey', 'demoProject', 'roleFallback', 'profileId'] as const;
const pickShared = (s: Partial<Settings>): Partial<SharedSettings> =>
  Object.fromEntries(SHARED_KEYS.filter((k) => s[k] !== undefined).map((k) => [k, s[k]])) as Partial<SharedSettings>;

async function readShared(): Promise<Partial<SharedSettings>> {
  try { return (await getAppProp<Partial<SharedSettings>>(SETTINGS_PROP)) ?? {}; }
  catch (e) { console.warn('Scrutineer: shared settings unavailable', String(e)); return {}; }
}

export async function getSettings(): Promise<Settings> {
  const [cur, shared] = await Promise.all([kvs.get(K.settings) as Promise<Partial<Settings> | undefined>, readShared()]);
  const s: Settings = { roleFallback: {}, profileId: 'iso26262', ...cur, ...shared, ingestToken: cur?.ingestToken ?? crypto.randomUUID() };
  if (!cur?.ingestToken) await kvs.set(K.settings, { ...cur, ingestToken: s.ingestToken });
  return s;
}
export async function saveSettings(patch: Partial<Omit<Settings, 'ingestToken'>>): Promise<Settings> {
  const s = { ...(await getSettings()), ...patch };
  await kvs.set(K.settings, s);
  // Other installation contexts fall back to inferring the project from the release name, so don't fail here.
  try { await setAppProp(SETTINGS_PROP, pickShared(s)); } catch (e) { console.warn('Scrutineer: could not share settings', String(e)); }
  return s;
}

// ---- Executions and suspect flags: issue properties on the test case.

const listOf = <T>(v: { list?: T[] } | undefined): T[] => (v && Array.isArray(v.list) ? v.list : []);

export const getExecutions = async (testKey: string) => listOf(await getIssueProp<{ list: Execution[] }>(testKey, EXEC_PROP));
export async function addExecutions(list: { testKey: string; exec: Execution }[]): Promise<void> {
  const byKey = new Map<string, Execution[]>();
  for (const { testKey, exec } of list) byKey.set(testKey, [...(byKey.get(testKey) ?? []), exec]);
  for (const [k, ex] of byKey) await setIssueProp(k, EXEC_PROP, { list: [...(await getExecutions(k)), ...ex].slice(-MAX_EXECUTIONS) });
}
export const getSuspects = async (testKey: string) => listOf(await getIssueProp<{ list: SuspectFlag[] }>(testKey, SUSPECT_PROP));
export const putSuspects = (testKey: string, flags: SuspectFlag[]) => setIssueProp(testKey, SUSPECT_PROP, { list: flags.slice(-MAX_SUSPECTS) });

/** Executions and suspects for every issue in a search result (the search requests both properties). */
export function executionsFromIssues(issues: JiraIssue[]): Record<string, Execution[]> {
  const out: Record<string, Execution[]> = {};
  for (const i of issues) { const l = readListProp<Execution>(i, EXEC_PROP); if (l.length) out[i.key] = l; }
  return out;
}
export function suspectsFromIssues(issues: JiraIssue[]): Record<string, SuspectFlag[]> {
  const out: Record<string, SuspectFlag[]> = {};
  for (const i of issues) { const l = readListProp<SuspectFlag>(i, SUSPECT_PROP); if (l.length) out[i.key] = l; }
  return out;
}

// ---- Sign-offs and evidence records: project properties.

export const getSignoffs = async (p: string, r: string) => ((await getProjectProp<Record<string, Signoff[]>>(p, SIGNOFF_PROP)) ?? {})[r] ?? [];
export async function putSignoffs(p: string, r: string, s: Signoff[]): Promise<void> {
  const all = (await getProjectProp<Record<string, Signoff[]>>(p, SIGNOFF_PROP)) ?? {};
  await setProjectProp(p, SIGNOFF_PROP, { ...all, [r]: s });
}

export async function addEvidence(p: string, _r: string, e: EvidenceRecord): Promise<void> {
  const cur = listOf(await getProjectProp<{ list: EvidenceRecord[] }>(p, EVIDENCE_PROP));
  await setProjectProp(p, EVIDENCE_PROP, { list: [...cur, e].slice(-MAX_EVIDENCE) });
}
export async function listEvidence(p: string, r?: string): Promise<EvidenceRecord[]> {
  const all = listOf(await getProjectProp<{ list: EvidenceRecord[] }>(p, EVIDENCE_PROP));
  return all.filter((e) => !r || e.release === r).sort((a, b) => (a.at < b.at ? 1 : -1));
}

// ---- Context-local KVS data.

async function queryPrefix<T>(prefix: string): Promise<Record<string, T>> {
  const out: Record<string, T> = {};
  let cursor: string | undefined;
  for (let i = 0; i < 100; i++) {
    let q = kvs.query().where('key', WhereConditions.beginsWith(safe(prefix))).limit(100);
    if (cursor) q = q.cursor(cursor);
    const { results, nextCursor } = await q.getMany();
    for (const r of results) out[r.key] = r.value as T;
    if (!nextCursor) break;
    cursor = nextCursor;
  }
  return out;
}

export const getStoredSnapshot = async (p: string, r: string) => (await kvs.get(safe(K.snap(p, r)))) as StoredSnapshot | undefined;
export const putStoredSnapshot = (p: string, r: string, s: StoredSnapshot) => kvs.set(safe(K.snap(p, r)), s);

export const getDemoStatus = async () => ((await kvs.get(K.demo)) as DemoStatus | undefined) ?? { state: 'idle', steps: [], at: new Date().toISOString() };
export const putDemoStatus = (s: DemoStatus) => kvs.set(K.demo, s);

/** Clears a project's sign-offs, evidence records and local cache. (Executions and suspects go with the deleted issues.) */
export async function deleteProjectState(projectKey: string): Promise<number> {
  let n = 0;
  await setProjectProp(projectKey, SIGNOFF_PROP, {});
  await setProjectProp(projectKey, EVIDENCE_PROP, { list: [] });
  // exec/suspect/evidence/signoff prefixes: data written by versions before state moved to Jira.
  for (const prefix of [`snap:${projectKey}:`, `exec:${projectKey}-`, `suspect:${projectKey}-`, `evidence:${projectKey}:`, `signoff:${projectKey}:`]) {
    for (const k of Object.keys(await queryPrefix(prefix))) { await kvs.delete(k); n++; }
  }
  return n;
}

/** Evidence snapshots are immutable: written once at publish time under their snapshot id, never overwritten. */
export async function putEvidenceSnapshot(snapshotId: string, s: StoredSnapshot & { snap: TraceSnapshot }): Promise<void> {
  await kvs.set(safe(`evsnap:${snapshotId}`), s, { keyPolicy: 'FAIL_IF_EXISTS' });
}
export const getEvidenceSnapshot = async (snapshotId: string) => (await kvs.get(safe(`evsnap:${snapshotId}`))) as (StoredSnapshot & { snap: TraceSnapshot }) | undefined;

export const getDemoComplete = async () => (await kvs.get('demo:complete')) as { projectKey: string; at: string } | undefined;
export const setDemoComplete = (projectKey: string) => kvs.set('demo:complete', { projectKey, at: new Date().toISOString() });
export const clearDemoComplete = () => kvs.delete('demo:complete');
