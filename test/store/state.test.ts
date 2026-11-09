import { describe, it, expect, vi, beforeEach } from 'vitest';

// Live bug: MCP calls ran in a different Forge installation context with its own KVS, so they saw
// no executions or suspects (NO-GO 65 vs the Control Room's verdict). Shared state now lives in Jira.
const jira = vi.hoisted(() => ({ issue: {} as Record<string, unknown>, project: {} as Record<string, unknown>, app: {} as Record<string, unknown>, appFails: false }));
const local = vi.hoisted(() => ({ kv: {} as Record<string, unknown> }));

vi.mock('../../src/jira/client', () => ({
  getIssueProp: async (k: string, p: string) => jira.issue[`${k}/${p}`],
  setIssueProp: async (k: string, p: string, v: unknown) => { jira.issue[`${k}/${p}`] = v; },
  getProjectProp: async (k: string, p: string) => jira.project[`${k}/${p}`],
  setProjectProp: async (k: string, p: string, v: unknown) => { jira.project[`${k}/${p}`] = v; },
  getAppProp: async (p: string) => { if (jira.appFails) throw new Error('403'); return jira.app[p]; },
  setAppProp: async (p: string, v: unknown) => { if (jira.appFails) throw new Error('403'); jira.app[p] = v; },
}));
vi.mock('@forge/kvs', () => ({
  kvs: { get: async (k: string) => local.kv[k], set: async (k: string, v: unknown) => { local.kv[k] = v; } },
  WhereConditions: {},
}));

import { addExecutions, executionsFromIssues, getSettings, getSignoffs, listEvidence, addEvidence, MAX_EXECUTIONS, putSignoffs, putSuspects, saveSettings, suspectsFromIssues } from '../../src/store/state';

const exec = (n: number) => ({ result: 'Passed' as const, version: 'V', executedAt: `2026-11-0${(n % 9) + 1}T00:00:00Z`, source: 'ci' as const, actor: `run ${n}` });

beforeEach(() => { jira.issue = {}; jira.project = {}; jira.app = {}; jira.appFails = false; local.kv = {}; });

describe('state in Jira', () => {
  it('stores executions on the test issue as { list }, appending and keeping the newest', async () => {
    await addExecutions([{ testKey: 'P-1', exec: exec(1) }, { testKey: 'P-1', exec: exec(2) }, { testKey: 'P-2', exec: exec(3) }]);
    expect(jira.issue['P-1/scrutineer.exec']).toEqual({ list: [exec(1), exec(2)] });
    for (let i = 0; i < MAX_EXECUTIONS + 5; i++) await addExecutions([{ testKey: 'P-1', exec: exec(i) }]);
    const list = (jira.issue['P-1/scrutineer.exec'] as { list: unknown[] }).list;
    expect(list).toHaveLength(MAX_EXECUTIONS);
    expect(list.at(-1)).toEqual(exec(MAX_EXECUTIONS + 4));
  });

  it('reads executions and suspects straight from search results, ignoring malformed values', () => {
    const flag = { testKey: 'P-1', upstreamKey: 'P-9', changedAt: 't', changedBy: 'x', reason: 'r' };
    const issues = [
      { key: 'P-1', fields: {}, properties: { 'scrutineer.exec': { list: [exec(1)] }, 'scrutineer.suspects': { list: [flag] } } },
      { key: 'P-2', fields: {}, properties: { 'scrutineer.exec': 'garbage' } },
      { key: 'P-3', fields: {} },
    ] as never[];
    expect(executionsFromIssues(issues)).toEqual({ 'P-1': [exec(1)] });
    expect(suspectsFromIssues(issues)).toEqual({ 'P-1': [flag] });
  });

  it('writes suspect flags to the test issue', async () => {
    await putSuspects('P-1', []);
    expect(jira.issue['P-1/scrutineer.suspects']).toEqual({ list: [] });
  });

  it('keeps sign-offs per release in one project property', async () => {
    const so = { role: 'Safety Manager' as const, accountId: 'a', name: 'A', at: 't', hash: 'h' };
    await putSignoffs('P', 'P 1.0', [so]);
    await putSignoffs('P', 'P 2.0', []);
    expect(await getSignoffs('P', 'P 1.0')).toEqual([so]);
    expect(await getSignoffs('P', 'P 3.0')).toEqual([]);
  });

  it('lists evidence newest first, filtered by release', async () => {
    const rec = (at: string, release: string) => ({ url: 'u', title: 't', hash: 'h', verdict: 'GO' as const, at, by: 'b', release, snapshotId: 's' });
    await addEvidence('P', 'R1', rec('2026-11-01', 'R1'));
    await addEvidence('P', 'R2', rec('2026-11-02', 'R2'));
    await addEvidence('P', 'R1', rec('2026-11-03', 'R1'));
    expect((await listEvidence('P', 'R1')).map((e) => e.at)).toEqual(['2026-11-03', '2026-11-01']);
    expect(await listEvidence('P')).toHaveLength(3);
  });
});

describe('settings', () => {
  it('shares everything but the ingest token through a Jira app property', async () => {
    await saveSettings({ defaultProject: 'BBW', evidenceSpaceKey: 'BBWSAFE' });
    expect(jira.app['scrutineer.settings']).toMatchObject({ defaultProject: 'BBW', evidenceSpaceKey: 'BBWSAFE' });
    expect(jira.app['scrutineer.settings']).not.toHaveProperty('ingestToken');
  });

  it('another installation context (empty KVS) still sees the shared settings', async () => {
    jira.app['scrutineer.settings'] = { defaultProject: 'BBW', roleFallback: {} };
    const s = await getSettings();
    expect(s.defaultProject).toBe('BBW');
    expect(s.ingestToken).toMatch(/[0-9a-f-]{36}/);
  });

  it('falls back to local settings when the app property cannot be read', async () => {
    local.kv.settings = { defaultProject: 'OLD', ingestToken: 'tok', roleFallback: {} };
    jira.appFails = true;
    const s = await getSettings();
    expect(s).toMatchObject({ defaultProject: 'OLD', ingestToken: 'tok' });
  });
});

describe('reset and resilience', () => {
  it('saving settings still succeeds when the shared app property cannot be written', async () => {
    jira.appFails = true;
    await expect(saveSettings({ defaultProject: 'BBW' })).resolves.toMatchObject({ defaultProject: 'BBW' });
  });
});
