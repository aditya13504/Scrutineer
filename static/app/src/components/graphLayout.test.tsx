import { describe, it, expect } from 'vitest';
import { layoutGraph } from './graphLayout';
import type { GateResult, TraceSnapshot } from '../types';

const snap: TraceSnapshot = {
  projectKey: 'BBW', release: 'BBW 2.3', suspects: [], executions: {},
  items: {
    'BBW-1': { key: 'BBW-1', role: 'HAZ', summary: 'Loss of braking', status: 'Done', statusCategory: 'done', fixVersions: ['BBW 2.3'] },
    'BBW-2': { key: 'BBW-2', role: 'REQ', summary: 'Pedal plausibility', status: 'Done', statusCategory: 'done', fixVersions: ['BBW 2.3'] },
    'BBW-3': { key: 'BBW-3', role: 'REQ', summary: 'Wheel speed', status: 'Done', statusCategory: 'done', fixVersions: ['BBW 2.3'] },
    'BBW-4': { key: 'BBW-4', role: 'TC', summary: 'Verify wheel speed', status: 'Done', statusCategory: 'done', fixVersions: ['BBW 2.3'] },
    'BBW-5': { key: 'BBW-5', role: 'DEF', summary: 'CAN timeout', status: 'Open', statusCategory: 'new', fixVersions: [] },
    'BBW-9': { key: 'BBW-9', role: 'TC', summary: 'Unrelated', status: 'Done', statusCategory: 'done', fixVersions: [] },
  },
  links: [
    { role: 'mitigates', from: 'BBW-2', to: 'BBW-1' }, { role: 'mitigates', from: 'BBW-3', to: 'BBW-1' },
    { role: 'verifies', from: 'BBW-4', to: 'BBW-3' }, { role: 'blocks', from: 'BBW-5', to: 'BBW-3' },
  ],
};
const gate = {
  verdict: 'NO_GO', score: 50, lights: 3, scope: ['BBW-2', 'BBW-3'], stats: {} as GateResult['stats'],
  findings: [
    { id: 'R4:BBW-2', ruleId: 'R4', severity: 'blocking', message: '', keys: ['BBW-2'], fix: 'create_test' },
    { id: 'R6:BBW-4', ruleId: 'R6', severity: 'blocking', message: '', keys: ['BBW-4', 'BBW-3'], fix: 'resolve_suspect' },
    { id: 'R8:BBW-5', ruleId: 'R8', severity: 'blocking', message: '', keys: ['BBW-5', 'BBW-3'], fix: 'resolve_defect' },
  ],
} as GateResult;

describe('layoutGraph', () => {
  it('places scope items in role columns, adds a ghost test for R4, styles suspect and blocking edges', () => {
    const g = layoutGraph(snap, gate);
    const col = (k: string) => g.nodes.find((n) => n.key === k)!.col;
    expect(col('BBW-1')).toBe(0);
    expect(col('BBW-2')).toBe(1);
    expect(col('BBW-5')).toBe(2);
    expect(col('BBW-4')).toBe(3);
    expect(g.nodes.find((n) => n.key === 'BBW-9')).toBeUndefined();
    const ghost = g.nodes.find((n) => n.ghost)!;
    expect(ghost).toMatchObject({ col: 3, key: 'missing:BBW-2' });
    expect(g.edges.find((e) => e.to === ghost.id)?.kind).toBe('gap');
    expect(g.edges.find((e) => e.from === 'BBW-3' && e.to === 'BBW-4')?.kind).toBe('suspect');
    expect(g.edges.find((e) => e.from === 'BBW-3' && e.to === 'BBW-5')?.kind).toBe('block');
    expect(g.nodes.find((n) => n.key === 'BBW-4')!.flag).toBe(true);
    expect(g.width).toBeGreaterThan(0);
    expect(g.height).toBeGreaterThan(0);
  });
});
