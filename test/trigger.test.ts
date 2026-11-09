import { describe, it, expect, vi, beforeEach } from 'vitest';

const st = vi.hoisted(() => ({ role: 'REQ' as string | undefined, applied: 0, at: '' }));
vi.mock('../src/jira/client', () => ({
  getIssue: async () => ({ key: 'P-1', properties: st.role ? { scrutineer: { role: st.role } } : {}, fields: { summary: 's', issuetype: { name: 'Task' } } }),
  getUser: async () => ({ displayName: 'Carol' }),
}));
vi.mock('../src/store/state', () => ({ getSettings: async () => ({ roleFallback: {} }) }));
vi.mock('../src/impact/apply', () => ({ applyChangeImpact: async (_p: string, _k: string, _a: string, at: string) => { st.applied++; st.at = at; return []; } }));

import { onIssueUpdated } from '../src/handlers/trigger';

const ev = { issue: { key: 'P-1', fields: { project: { key: 'P' } } }, changelog: { items: [{ field: 'description' }] } };

beforeEach(() => { st.applied = 0; });

describe('onIssueUpdated (review I7)', () => {
  it('skips the project-wide work for issues that are not hazards, requirements or decisions', async () => {
    st.role = 'IMP'; await onIssueUpdated(ev); expect(st.applied).toBe(0);
    st.role = undefined; await onIssueUpdated(ev); expect(st.applied).toBe(0);
  });
  it('runs change impact for a requirement', async () => {
    st.role = 'REQ'; await onIssueUpdated(ev); expect(st.applied).toBe(1);
  });
});

describe('onIssueUpdated timestamps (live bug: Jira sends epoch millis as a string)', () => {
  beforeEach(() => { st.role = 'REQ'; });
  it('accepts epoch milliseconds sent as a string', async () => {
    await onIssueUpdated({ ...ev, timestamp: '1794223526188' });
    expect(st.at).toBe(new Date(1794223526188).toISOString());
  });
  it('accepts epoch milliseconds as a number and ISO strings', async () => {
    await onIssueUpdated({ ...ev, timestamp: 1794223526188 });
    expect(st.at).toBe(new Date(1794223526188).toISOString());
    await onIssueUpdated({ ...ev, timestamp: '2026-11-09T11:25:26.188Z' });
    expect(st.at).toBe('2026-11-09T11:25:26.188Z');
  });
  it('falls back to now instead of crashing on an unreadable timestamp', async () => {
    const before = Date.now();
    await onIssueUpdated({ ...ev, timestamp: 'not a time' });
    expect(st.applied).toBe(1);
    expect(Date.parse(st.at)).toBeGreaterThanOrEqual(before);
  });
});
