import { describe, it, expect } from 'vitest';
import fixture from './fixtures/search.json';
import { mapIssue, mapLinks, LINK_TYPES, linkRoleOf, type JiraIssue } from '../../src/jira/map';

const issues = fixture.issues as unknown as JiraIssue[];
const fallback = { 'Test Case': 'TC' as const };

describe('mapIssue', () => {
  it('takes role, asil and flags from the scrutineer property', () => {
    const r = mapIssue(issues[1], fallback)!;
    expect(r).toMatchObject({ key: 'BBW-2', role: 'REQ', asil: 'D', superseded: false, summary: 'Brake pedal plausibility',
      status: 'In Progress', statusCategory: 'indeterminate', assigneeId: 'acc-1', assigneeName: 'Alice' });
    expect(r.fixVersions).toEqual(['BBW 2.3', 'BBW 2.4']);
    expect(r.updatedAt).toBe(new Date('2026-11-02T10:00:00.000Z').toISOString());
  });

  it('falls back to issue type name mapping', () => {
    expect(mapIssue(issues[2], fallback)!.role).toBe('TC');
    expect(mapIssue(issues[2], fallback)!.statusCategory).toBe('new');
  });

  it('returns null when no role can be determined', () => {
    expect(mapIssue(issues[3], fallback)).toBeNull();
  });

  it('maps done status category and severity', () => {
    expect(mapIssue(issues[0], {})!.statusCategory).toBe('done');
    expect(mapIssue(issues[4], {})!.severity).toBe('Major');
  });

  it('ignores an invalid role in the property', () => {
    const bad = { ...issues[0], properties: { scrutineer: { role: 'NOPE' } } } as unknown as JiraIssue;
    expect(mapIssue(bad, {})).toBeNull();
  });
});

describe('mapLinks', () => {
  it('reads outward entries only, de-duplicates, ignores unknown link types', () => {
    expect(mapLinks(issues)).toEqual([
      { role: 'mitigates', from: 'BBW-2', to: 'BBW-1' },
      { role: 'verifies', from: 'BBW-3', to: 'BBW-2' },
      { role: 'blocks', from: 'BBW-5', to: 'BBW-2' },
    ]);
  });

  it('link type table and reverse lookup agree', () => {
    expect(LINK_TYPES.verifies.name).toBe('Scrutineer Verifies');
    expect(LINK_TYPES.blocks.name).toBe('Blocks');
    expect(linkRoleOf('Scrutineer Derived')).toBe('derivedFrom');
    expect(linkRoleOf('Relates')).toBeUndefined();
  });
});
