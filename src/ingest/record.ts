import type { Execution, ExecResult } from '../engine/types';
import { getIssue } from '../jira/client';
import { mapIssue, readProperty } from '../jira/map';
import { buildSnapshot } from '../snapshot/build';
import { addExecutions, getSettings } from '../store/state';
import { parseIngest, type IngestResult } from './ingest';

export async function knownTestKeys(projectKey: string): Promise<Set<string>> {
  const snap = await buildSnapshot(projectKey, '');
  return new Set(Object.values(snap.items).filter((i) => i.role === 'TC').map((i) => i.key));
}

export async function ingestBody(body: string, actorOverride?: string): Promise<IngestResult & { projectKey?: string }> {
  let projectKey: string | undefined;
  let runId: string | undefined;
  try { const p = JSON.parse(body); projectKey = p?.projectKey; runId = p?.runId; } catch { /* parseIngest reports it */ }
  projectKey = projectKey ?? (await getSettings()).defaultProject;
  if (!projectKey) return { accepted: [], rejected: [], error: 'No projectKey given and no default project configured.' };
  const known = await knownTestKeys(projectKey);
  const res = parseIngest(body, known, actorOverride ?? `CI (${runId ?? 'unknown run'})`, new Date().toISOString(), 'ci');
  if (!res.error && res.accepted.length) await addExecutions(res.accepted);
  return { ...res, projectKey };
}

async function assertTestCase(testKey: string) {
  const raw = await getIssue(testKey);
  const settings = await getSettings();
  const item = mapIssue(raw, settings.roleFallback);
  if (item?.role !== 'TC') throw new Error(`${testKey} is not a Scrutineer test case.`);
  return { raw, item };
}

/** Simulated HIL bench run (demo only). Goes through the same parse path as CI so the evidence shape is identical. */
export async function recordBenchRun(testKey: string, version: string, actorName: string): Promise<Execution> {
  const { raw } = await assertTestCase(testKey);
  const outcome = readProperty(raw).benchOutcome === 'fail' ? 'failed' : 'passed';
  const body = JSON.stringify({ version, runId: `bench-sim-${Date.now()}`, results: [{ testKey, result: outcome }] });
  const res = parseIngest(body, new Set([testKey]), `Simulated HIL bench (requested by ${actorName})`, new Date().toISOString(), 'bench-sim');
  if (res.error || !res.accepted.length) throw new Error(res.error ?? res.rejected[0]?.reason ?? 'Bench run rejected');
  await addExecutions(res.accepted);
  return res.accepted[0].exec;
}

export async function recordManual(testKey: string, version: string, result: Exclude<ExecResult, 'NotRun'>, actorName: string, note?: string): Promise<Execution> {
  await assertTestCase(testKey);
  const exec: Execution = { result, version, executedAt: new Date().toISOString(), source: 'manual', actor: actorName };
  if (note?.trim()) exec.reference = note.trim().slice(0, 300);
  await addExecutions([{ testKey, exec }]);
  return exec;
}
