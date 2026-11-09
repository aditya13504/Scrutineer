import { describe, it, expect, vi } from 'vitest';

vi.mock('@forge/api', () => {
  const requestJira = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ issues: [{ key: 'P-1', fields: { summary: 's' } }], nextPageToken: 'more' }) });
  return { default: { asApp: () => ({ requestJira }), asUser: () => ({ requestJira }) }, route: (s: TemplateStringsArray, ...v: unknown[]) => s.reduce((a, p, i) => a + p + (v[i] ?? ''), '') };
});

import { searchIssues } from '../../src/jira/client';

describe('searchIssues (review I7)', () => {
  it('throws instead of silently evaluating a truncated project', async () => {
    await expect(searchIssues('project = P')).rejects.toThrow(/too many issues/i);
  });
});
