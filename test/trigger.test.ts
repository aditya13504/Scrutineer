import { describe, it, expect, vi, beforeEach } from 'vitest';

const st = vi.hoisted(() => ({ role: 'REQ' as string | undefined, applied: 0 }));
vi.mock('../src/jira/client', () => ({
  getIssue: async () => ({ key: 'P-1', properties: st.role ? { scrutineer: { role: st.role } } : {}, fields: { summary: 's', issuetype: { name: 'Task' } } }),
  getUser: async () => ({ displayName: 'Carol' }),
}));
vi.mock('../src/store/kvs', () => ({ getSettings: async () => ({ roleFallback: {} }) }));
vi.mock('../src/impact/apply', () => ({ applyChangeImpact: async () => { st.applied++; return []; } }));

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
