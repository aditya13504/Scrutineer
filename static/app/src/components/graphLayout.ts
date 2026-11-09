import type { GateResult, Role, TraceSnapshot } from '../types';

export interface GNode { id: string; key: string; role?: Role; label: string; title: string; col: number; x: number; y: number; flag: boolean; ghost: boolean }
export interface GEdge { from: string; to: string; kind: 'normal' | 'gap' | 'suspect' | 'block' }
export interface GLayout { nodes: GNode[]; edges: GEdge[]; width: number; height: number; columns: { title: string; x: number }[] }

export const NODE_W = 196;
export const NODE_H = 40;
const COL_GAP = 64;
const ROW_GAP = 10;
const TOP = 34;
const LEFT = 16;

const COL: Partial<Record<Role, number>> = { HAZ: 0, DEC: 0, REQ: 1, IMP: 2, DEF: 2, TC: 3 };
export const COLUMN_TITLES = ['Hazards and decisions', 'Safety requirements', 'Implementation and defects', 'Verification'];

const trunc = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function layoutGraph(snap: TraceSnapshot, gate: GateResult): GLayout {
  const scope = gate.scope.filter((k) => snap.items[k]);
  const scopeSet = new Set(scope);
  const keys = new Set<string>(scope);
  const edges: GEdge[] = [];
  const flagged = new Set(gate.findings.flatMap((f) => f.keys));
  const suspect = new Set(gate.findings.filter((f) => f.ruleId === 'R6').map((f) => f.keys[0]));

  for (const l of snap.links) {
    const reqSide = scopeSet.has(l.to) ? l.to : scopeSet.has(l.from) ? l.from : null;
    if (!reqSide) continue;
    const other = reqSide === l.to ? l.from : l.to;
    const o = snap.items[other];
    if (!o || COL[o.role] === undefined || (o.role === 'REQ' && !scopeSet.has(other))) continue;
    keys.add(other);
    const oc = COL[o.role]!;
    const [from, to] = oc < 1 ? [other, reqSide] : [reqSide, other];
    const kind: GEdge['kind'] = o.role === 'TC' && suspect.has(other) ? 'suspect' : o.role === 'DEF' && o.statusCategory !== 'done' ? 'block' : 'normal';
    if (!edges.some((e) => e.from === from && e.to === to)) edges.push({ from, to, kind });
  }

  const nodes: GNode[] = [...keys].map((k) => {
    const it = snap.items[k];
    return { id: k, key: k, role: it.role, label: trunc(it.summary, 26), title: `${it.role} ${k}: ${it.summary}`, col: COL[it.role] ?? 1, x: 0, y: 0, flag: flagged.has(k), ghost: false };
  });
  for (const f of gate.findings.filter((x) => x.ruleId === 'R4')) {
    const id = `missing:${f.keys[0]}`;
    nodes.push({ id, key: id, label: 'No verifying test', title: `Missing test case for ${f.keys[0]}`, col: 3, x: 0, y: 0, flag: true, ghost: true });
    edges.push({ from: f.keys[0], to: id, kind: 'gap' });
  }

  // Order: requirements by key; other columns by the mean row of their linked requirements (fewer crossings).
  const reqOrder = new Map(scope.map((k, i) => [k, i]));
  const rank = (n: GNode) => {
    if (n.col === 1) return reqOrder.get(n.key) ?? 0;
    const linked = edges.filter((e) => e.from === n.id || e.to === n.id).map((e) => (e.from === n.id ? e.to : e.from)).filter((k) => reqOrder.has(k));
    return linked.length ? linked.reduce((s, k) => s + reqOrder.get(k)!, 0) / linked.length : 999;
  };
  const cols: GNode[][] = [[], [], [], []];
  for (const n of nodes) cols[n.col].push(n);
  let maxRows = 0;
  cols.forEach((list, c) => {
    list.sort((a, b) => rank(a) - rank(b) || a.key.localeCompare(b.key, undefined, { numeric: true }));
    list.forEach((n, i) => { n.x = LEFT + c * (NODE_W + COL_GAP); n.y = TOP + i * (NODE_H + ROW_GAP); });
    maxRows = Math.max(maxRows, list.length);
  });

  return {
    nodes, edges,
    width: LEFT * 2 + 4 * NODE_W + 3 * COL_GAP,
    height: TOP + Math.max(1, maxRows) * (NODE_H + ROW_GAP) + 8,
    columns: COLUMN_TITLES.map((title, c) => ({ title, x: LEFT + c * (NODE_W + COL_GAP) })),
  };
}
