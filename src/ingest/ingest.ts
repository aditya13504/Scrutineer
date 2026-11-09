// Pure parsing/validation of CI / HIL bench test results.
import { timingSafeEqual } from 'node:crypto';
import type { Execution, ExecSource } from '../engine/types';

export interface IngestPayload {
  projectKey?: string;
  version: string;
  runId?: string;
  runUrl?: string;
  results: { testKey: string; result: string }[];
}
export interface IngestResult {
  accepted: { testKey: string; exec: Execution }[];
  rejected: { index: number; reason: string }[];
  error?: string;
}

export function parseIngest(body: string, knownTests: Set<string>, actor: string, now: string, source: ExecSource): IngestResult {
  let p: Partial<IngestPayload>;
  try { p = JSON.parse(body); } catch { return { accepted: [], rejected: [], error: 'Body is not valid JSON.' }; }
  if (!p || typeof p !== 'object') return { accepted: [], rejected: [], error: 'Body must be a JSON object.' };
  if (typeof p.version !== 'string' || !p.version.trim()) return { accepted: [], rejected: [], error: 'Missing "version" (the Jira fix version the run tested).' };
  if (!Array.isArray(p.results)) return { accepted: [], rejected: [], error: 'Missing "results" array.' };
  const reference = p.runUrl ?? p.runId;
  const out: IngestResult = { accepted: [], rejected: [] };
  p.results.forEach((r, index) => {
    const key = typeof r?.testKey === 'string' ? r.testKey.trim().toUpperCase() : '';
    const res = typeof r?.result === 'string' ? r.result.trim().toLowerCase() : '';
    if (!key) return out.rejected.push({ index, reason: 'Missing testKey' });
    if (!knownTests.has(key)) return out.rejected.push({ index, reason: `Unknown test case ${key}` });
    if (res !== 'passed' && res !== 'failed') return out.rejected.push({ index, reason: `result must be passed or failed (got "${r.result}")` });
    const exec: Execution = { result: res === 'passed' ? 'Passed' : 'Failed', version: p.version!.trim(), executedAt: now, source, actor };
    if (reference) exec.reference = String(reference);
    out.accepted.push({ testKey: key, exec });
  });
  return out;
}

export function checkToken(headers: Record<string, string[] | undefined>, token: string): boolean {
  if (!token) return false;
  const entry = Object.entries(headers).find(([k]) => k.toLowerCase() === 'x-scrutineer-token');
  const given = entry?.[1]?.[0] ?? '';
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** 200 all recorded, 207 mixed, 422 nothing recorded (incl. empty batch), 400 malformed body. */
export function ingestStatusCode(r: Pick<IngestResult, 'accepted' | 'rejected' | 'error'>): number {
  if (r.error) return 400;
  if (!r.accepted.length) return 422;
  return r.rejected.length ? 207 : 200;
}
