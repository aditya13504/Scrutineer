import { describe, it, expect } from 'vitest';
import fixture from './fixtures/search.json';
import { assembleSnapshot } from '../../src/snapshot/assemble';
import type { JiraIssue } from '../../src/jira/map';

describe('assembleSnapshot', () => {
  it('maps issues, drops role-less ones, keeps executions/suspects only for known tests, drops dangling links', () => {
    const snap = assembleSnapshot({
      projectKey: 'BBW', release: 'BBW 2.3', profileId: 'iso26262', takenAt: '2026-11-09T00:00:00.000Z',
      issues: fixture.issues as unknown as JiraIssue[],
      roleFallback: { 'Test Case': 'TC' },
      executions: {
        'BBW-3': [{ result: 'Passed', version: 'BBW 2.3', executedAt: '2026-11-04T00:00:00.000Z', source: 'ci', actor: 'CI' }],
        'BBW-99': [{ result: 'Passed', version: 'BBW 2.3', executedAt: '2026-11-04T00:00:00.000Z', source: 'ci', actor: 'CI' }],
      },
      suspects: {
        'BBW-3': [{ testKey: 'BBW-3', upstreamKey: 'BBW-2', changedAt: '2026-11-05T00:00:00.000Z', changedBy: 'x', reason: 'r' }],
      },
    });
    expect(Object.keys(snap.items).sort()).toEqual(['BBW-1', 'BBW-2', 'BBW-3', 'BBW-5']);
    expect(Object.keys(snap.executions)).toEqual(['BBW-3']);
    expect(snap.suspects).toHaveLength(1);
    expect(snap.links.every((l) => snap.items[l.from] && snap.items[l.to])).toBe(true);
    expect(snap.links).toHaveLength(3);
  });
});
