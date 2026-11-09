// Typed wrappers over Forge KVS. All Scrutineer state lives here (Runs on Atlassian; no egress).
import { kvs, WhereConditions } from '@forge/kvs';
import type { Execution, GateResult, Role, SuspectFlag, TraceSnapshot } from '../engine/types';

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

const K = {
  exec: (issueKey: string) => `exec:${issueKey}`,
  suspect: (testKey: string) => `suspect:${testKey}`,
  snap: (p: string, r: string) => `snap:${p}:${r}:latest`,
  evidence: (p: string, r: string, at: string) => `evidence:${p}:${r}:${at}`,
  signoff: (p: string, r: string) => `signoff:${p}:${r}`,
  settings: 'settings',
  demo: 'demo:status',
};

// KVS keys allow a limited charset; release names contain spaces and dots, which are allowed.
const safe = (s: string) => s.replace(/[^a-zA-Z0-9:._\s\-#]/g, '_');

export async function getSettings(): Promise<Settings> {
  const cur = (await kvs.get(K.settings)) as Partial<Settings> | undefined;
  const s: Settings = { roleFallback: {}, profileId: 'iso26262', ...cur, ingestToken: cur?.ingestToken ?? crypto.randomUUID() };
  if (!cur?.ingestToken) await kvs.set(K.settings, s);
  return s;
}
export async function saveSettings(patch: Partial<Omit<Settings, 'ingestToken'>>): Promise<Settings> {
  const s = { ...(await getSettings()), ...patch };
  await kvs.set(K.settings, s);
  return s;
}

export const getExecutions = async (k: string) => ((await kvs.get(safe(K.exec(k)))) as Execution[] | undefined) ?? [];
export async function addExecutions(list: { testKey: string; exec: Execution }[]): Promise<void> {
  const byKey = new Map<string, Execution[]>();
  for (const { testKey, exec } of list) byKey.set(testKey, [...(byKey.get(testKey) ?? []), exec]);
  for (const [k, ex] of byKey) await kvs.set(safe(K.exec(k)), [...(await getExecutions(k)), ...ex].slice(-200));
}
export const getSuspects = async (k: string) => ((await kvs.get(safe(K.suspect(k)))) as SuspectFlag[] | undefined) ?? [];
export const putSuspects = (k: string, flags: SuspectFlag[]) => kvs.set(safe(K.suspect(k)), flags.slice(-100));

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
const stripPrefix = <T>(rec: Record<string, T>, prefix: string) => Object.fromEntries(Object.entries(rec).map(([k, v]) => [k.slice(prefix.length), v]));

/** All executions / suspects for issues of a project (keys look like exec:BBW-12). */
export const projectExecutions = async (projectKey: string) => stripPrefix(await queryPrefix<Execution[]>(`exec:${projectKey}-`), 'exec:');
export const projectSuspects = async (projectKey: string) => stripPrefix(await queryPrefix<SuspectFlag[]>(`suspect:${projectKey}-`), 'suspect:');

export const getStoredSnapshot = async (p: string, r: string) => (await kvs.get(safe(K.snap(p, r)))) as StoredSnapshot | undefined;
export const putStoredSnapshot = (p: string, r: string, s: StoredSnapshot) => kvs.set(safe(K.snap(p, r)), s);

export const addEvidence = (p: string, r: string, e: EvidenceRecord) => kvs.set(safe(K.evidence(p, r, e.at)), e);
export async function listEvidence(p: string, r?: string): Promise<EvidenceRecord[]> {
  const rec = await queryPrefix<EvidenceRecord>(r ? `evidence:${p}:${r}:` : `evidence:${p}:`);
  return Object.values(rec).sort((a, b) => (a.at < b.at ? 1 : -1));
}

export const getSignoffs = async (p: string, r: string) => ((await kvs.get(safe(K.signoff(p, r)))) as Signoff[] | undefined) ?? [];
export const putSignoffs = (p: string, r: string, s: Signoff[]) => kvs.set(safe(K.signoff(p, r)), s);

export const getDemoStatus = async () => ((await kvs.get(K.demo)) as DemoStatus | undefined) ?? { state: 'idle', steps: [], at: new Date().toISOString() };
export const putDemoStatus = (s: DemoStatus) => kvs.set(K.demo, s);

export async function deleteProjectState(projectKey: string): Promise<number> {
  let n = 0;
  for (const prefix of [`exec:${projectKey}-`, `suspect:${projectKey}-`, `snap:${projectKey}:`, `evidence:${projectKey}:`, `signoff:${projectKey}:`]) {
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
