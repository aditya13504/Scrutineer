import type { TraceItem, TraceSnapshot, Execution, LinkRole, Role } from '../../src/engine/types';

export const REL = 'BBW 2.3';
export const T0 = '2026-11-01T10:00:00.000Z';

export function item(key: string, role: Role, extra: Partial<TraceItem> = {}): TraceItem {
  return {
    key, role, summary: `${role} ${key} summary`, status: 'Done', statusCategory: 'done',
    fixVersions: [REL], updatedAt: T0, ...extra,
  };
}

export function passed(version = REL, at = '2026-11-02T10:00:00.000Z'): Execution {
  return { result: 'Passed', version, executedAt: at, source: 'ci', actor: 'CI (run 1)' };
}

/** A fully traced, all-green release: H1 <- R1 <- I1, T1 verifies R1 and passed on BBW 2.3. */
export function mkSnap(): TraceSnapshot {
  const items: TraceItem[] = [
    item('H1', 'HAZ', { asil: 'D' }),
    item('R1', 'REQ', { asil: 'D' }),
    item('I1', 'IMP', { assigneeId: 'alice', reviewerId: 'bob' }),
    item('T1', 'TC'),
  ];
  return {
    projectKey: 'BBW', release: REL, profileId: 'iso26262', takenAt: T0,
    items: Object.fromEntries(items.map((i) => [i.key, i])),
    links: [
      { role: 'mitigates', from: 'R1', to: 'H1' },
      { role: 'implements', from: 'I1', to: 'R1' },
      { role: 'verifies', from: 'T1', to: 'R1' },
    ],
    executions: { T1: [passed()] },
    suspects: [],
  };
}

export function add(snap: TraceSnapshot, ...items: TraceItem[]): TraceSnapshot {
  for (const i of items) snap.items[i.key] = i;
  return snap;
}

export function link(snap: TraceSnapshot, role: LinkRole, from: string, to: string): TraceSnapshot {
  snap.links.push({ role, from, to });
  return snap;
}
