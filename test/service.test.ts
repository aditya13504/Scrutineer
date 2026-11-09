import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkSnap } from './engine/fixtures';

const state = vi.hoisted(() => ({
  settings: { roleFallback: {}, ingestToken: 't', profileId: 'iso26262', defaultProject: 'BBW', demoProject: 'BBW' } as Record<string, unknown>,
  versions: [] as { id: string; name: string; released: boolean; archived?: boolean }[],
  snap: null as unknown,
  signoffs: [] as unknown[],
  issue: null as unknown,
}));

vi.mock('../src/store/kvs', () => ({
  getSettings: async () => state.settings,
  getSignoffs: async () => state.signoffs,
  putSignoffs: async (_p: string, _r: string, s: unknown[]) => { state.signoffs = s; },
  putStoredSnapshot: async () => undefined,
}));
vi.mock('../src/jira/client', () => ({
  listVersions: async () => state.versions,
  getIssue: async () => state.issue,
}));
vi.mock('../src/snapshot/build', () => ({ buildSnapshot: async () => state.snap }));
vi.mock('../src/ingest/record', () => ({ recordBenchRun: async () => ({ result: 'Passed' }) }));

import { resolveProject, resolveRelease, applyFix } from '../src/service';
import { signOff } from '../src/signoff';
import { validateRelease } from '../src/handlers/validator';

beforeEach(() => {
  state.settings = { roleFallback: {}, ingestToken: 't', profileId: 'iso26262', defaultProject: 'BBW', demoProject: 'BBW' };
  state.versions = [{ id: '1', name: 'BBW 2.2', released: true }, { id: '2', name: 'BBW 2.3', released: false }, { id: '3', name: 'BBW 2.4', released: false }];
  state.snap = mkSnap();
  state.signoffs = [];
});

describe('service', () => {
  it('resolveProject: input, then default project, then a helpful error', async () => {
    expect(await resolveProject('abc')).toBe('ABC');
    expect(await resolveProject(undefined)).toBe('BBW');
    state.settings.defaultProject = undefined;
    await expect(resolveProject(undefined)).rejects.toThrow(/Load the demo or set a default project/);
  });

  it('resolveRelease: input, else first unreleased version, else error', async () => {
    expect(await resolveRelease('BBW', 'BBW 2.2')).toBe('BBW 2.2');
    expect(await resolveRelease('BBW', undefined)).toBe('BBW 2.3');
    state.versions = [{ id: '1', name: 'BBW 2.2', released: true }];
    await expect(resolveRelease('BBW', undefined)).rejects.toThrow(/no unreleased version/i);
  });

  it('applyFix run_test refuses outside the demo project', async () => {
    const s = mkSnap(); s.executions = {}; state.snap = s;
    state.settings.demoProject = 'OTHER';
    await expect(applyFix('BBW', 'BBW 2.3', 'R5:T1', {}, { accountId: 'a', name: 'Ann' })).rejects.toThrow(/Record a CI or manual result/);
    state.settings.demoProject = 'BBW';
    await expect(applyFix('BBW', 'BBW 2.3', 'R5:T1', {}, { accountId: 'a', name: 'Ann' })).resolves.toMatchObject({ ok: true });
  });

  it('applyFix rejects an unknown finding id', async () => {
    await expect(applyFix('BBW', 'BBW 2.3', 'R4:NOPE', {}, { accountId: 'a', name: 'Ann' })).rejects.toThrow(/no longer open/);
  });
});

describe('signOff', () => {
  it('refuses unless the gate is GO', async () => {
    const s = mkSnap(); s.executions = {}; state.snap = s;
    await expect(signOff('BBW', 'BBW 2.3', 'Safety Manager', 'acc', 'Priya')).rejects.toThrow(/only a GO release/i);
  });

  it('records one sign-off per role, newest replaces older', async () => {
    await signOff('BBW', 'BBW 2.3', 'Safety Manager', 'acc1', 'Priya');
    await signOff('BBW', 'BBW 2.3', 'Test Lead', 'acc2', 'Mei');
    await signOff('BBW', 'BBW 2.3', 'Safety Manager', 'acc3', 'Jonas');
    const list = state.signoffs as { role: string; name: string; hash: string }[];
    expect(list.map((s) => `${s.role}:${s.name}`).sort()).toEqual(['Safety Manager:Jonas', 'Test Lead:Mei']);
    expect(list[0].hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('validateRelease', () => {
  const issue = (labels: string[]) => ({ key: 'BBW-99', fields: { summary: 'Release 2.3', labels, fixVersions: [{ name: 'BBW 2.3' }] } });

  it('passes issues without the release-gate label', async () => {
    state.issue = issue([]);
    expect(await validateRelease({ issue: { key: 'BBW-99' } })).toEqual({ result: true });
  });

  it('blocks a release-gate issue whose release is NO-GO', async () => {
    state.issue = issue(['release-gate']);
    const s = mkSnap(); s.executions = {}; state.snap = s;
    const r = await validateRelease({ issue: { key: 'BBW-99' } });
    expect(r.result).toBe(false);
    expect(r.errorMessage).toBe('Scrutineer: BBW 2.3 is NO-GO — 1 blocking finding(s). Open the Scrutineer Control Room.');
  });

  it('allows a release-gate issue whose release is GO', async () => {
    state.issue = issue(['release-gate']);
    expect((await validateRelease({ issue: { key: 'BBW-99' } })).result).toBe(true);
  });
});
