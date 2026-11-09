import { describe, it, expect, vi } from 'vitest';
import { item } from '../engine/fixtures';

const calls = vi.hoisted(() => [] as string[]);
vi.mock('../../src/jira/client', () => ({
  adfText: (t: string) => t,
  ensureLinkTypes: async () => { calls.push('ensureLinkTypes'); },
  createIssue: async () => { calls.push('createIssue'); return { id: '1', key: 'P-9' }; },
  setIssueProperty: async () => { calls.push('setIssueProperty'); },
  createLink: async () => { calls.push('createLink'); },
}));

import { createLinkedTest } from '../../src/drafts/create';

describe('createLinkedTest (review I6)', () => {
  it('makes sure the Scrutineer link types exist before creating anything', async () => {
    const key = await createLinkedTest('P', item('P-1', 'REQ'), { summary: 's', preconditions: [], steps: ['a'], expected: 'e' }, 'P 1.0', false);
    expect(key).toBe('P-9');
    expect(calls).toEqual(['ensureLinkTypes', 'createIssue', 'setIssueProperty', 'createLink']);
  });
});
