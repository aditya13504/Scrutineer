import { invoke, router } from '@forge/bridge';
import type { DemoStatus, EvidenceRecord, IssueTrace, Readiness, Signoff, TestDraft, Execution, Brief } from './types';

type Envelope<T> = { ok: true; data: T } | { ok: false; error: string };

export async function call<T>(name: string, payload: Record<string, unknown> = {}): Promise<T> {
  const res = (await invoke(name, payload)) as Envelope<T>;
  if (!res || !res.ok) throw new Error((res as { error?: string })?.error ?? `Request ${name} failed`);
  return res.data;
}

export interface ContextInfo { projectKey?: string; me: { accountId: string; name: string }; settings: { defaultProject?: string; evidenceSpaceKey?: string; demoProject?: string } }

export const api = {
  context: () => call<ContextInfo>('getContextInfo'),
  releases: (projectKey?: string) => call<{ id: string; name: string; released: boolean }[]>('listReleases', { projectKey }),
  readiness: (projectKey: string | undefined, release?: string) => call<Readiness>('getReadiness', { projectKey, release }),
  draftTest: (projectKey: string, requirementKey: string) => call<{ requirement: Brief; draft: TestDraft }>('draftTest', { projectKey, requirementKey }),
  applyFix: (projectKey: string, release: string, findingId: string, input: Record<string, unknown> = {}) =>
    call<{ ok: boolean; message: string; createdKey?: string }>('applyFix', { projectKey, release, findingId, input }),
  issueTrace: (issueKey: string) => call<IssueTrace>('getIssueTrace', { issueKey }),
  recordManual: (testKey: string, version: string, result: 'Passed' | 'Failed', note?: string) => call<Execution>('recordManualResult', { testKey, version, result, note }),
  runBench: (testKey: string, version: string) => call<Execution>('runBench', { testKey, version }),
  resolveSuspect: (testKey: string, justification: string, upstreamKey?: string) => call<{ ok: boolean }>('resolveSuspect', { testKey, justification, upstreamKey }),
  setIssueMeta: (issueKey: string, patch: Record<string, unknown>) => call<{ flagged: string[] }>('setIssueMeta', { issueKey, patch }),
  publishEvidence: (projectKey: string, release: string) => call<EvidenceRecord>('publishEvidence', { projectKey, release }),
  listEvidence: (projectKey: string, release?: string) => call<EvidenceRecord[]>('listEvidence', { projectKey, release }),
  signOff: (projectKey: string, release: string, role: Signoff['role']) => call<Signoff[]>('signOff', { projectKey, release, role }),
  signoffs: (projectKey: string, release: string) => call<Signoff[]>('listSignoffs', { projectKey, release }),
  reviewerOptions: (projectKey: string) => call<{ accountId: string; displayName: string }[]>('reviewerOptions', { projectKey }),
  settings: () => call<{ defaultProject?: string; evidenceSpaceKey?: string; demoProject?: string }>('getSettings'),
  saveSettings: (s: { defaultProject?: string; evidenceSpaceKey?: string }) => call('saveSettings', s),
  ingestInfo: () => call<{ url: string; token: string }>('getIngestInfo'),
  loadDemo: () => call('loadDemo'),
  resetDemo: () => call('resetDemo'),
  demoStatus: () => call<DemoStatus>('getDemoStatus'),
};

export function openIssue(key: string) {
  void router.open(`/browse/${encodeURIComponent(key)}`);
}
export function openUrl(url: string) {
  void router.open(url);
}
