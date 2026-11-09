import { useMemo } from 'react';
import { openIssue } from '../api';
import type { GateResult, TraceSnapshot } from '../types';
import { layoutGraph, NODE_H, NODE_W } from './graphLayout';

const ROLE_COLOUR: Record<string, string> = { HAZ: 'var(--role-HAZ)', REQ: 'var(--role-REQ)', IMP: 'var(--role-IMP)', TC: 'var(--role-TC)', DEF: 'var(--role-DEF)', DEC: 'var(--role-DEC)' };

export function TraceGraph({ snap, gate, onGhost }: { snap: TraceSnapshot; gate: GateResult; onGhost: (reqKey: string) => void }) {
  const g = useMemo(() => layoutGraph(snap, gate), [snap, gate]);
  const pos = new Map(g.nodes.map((n) => [n.id, n]));
  const activate = (id: string, ghost: boolean) => (ghost ? onGhost(id.replace('missing:', '')) : openIssue(id));

  return (
    <>
      <div className="graph-legend" aria-hidden="true">
        <span><i style={{ borderColor: 'var(--border-bold)' }} />Trace link</span>
        <span><i style={{ borderColor: 'var(--lamp-red)', borderTopStyle: 'dashed' }} />Missing link</span>
        <span><i style={{ borderColor: 'var(--lamp-amber)', borderTopStyle: 'dashed' }} />Suspect (upstream changed)</span>
        <span><i style={{ borderColor: 'var(--lamp-red)' }} />Blocked by open defect</span>
      </div>
      <div className="graph-wrap">
        <svg width={g.width} height={g.height} viewBox={`0 0 ${g.width} ${g.height}`} role="group" aria-label={`Trace graph for ${snap.release}`}>
          {g.columns.map((c) => <text key={c.title} className="colhead" x={c.x} y={20}>{c.title}</text>)}
          {g.edges.map((e) => {
            const a = pos.get(e.from); const b = pos.get(e.to);
            if (!a || !b) return null;
            const x1 = a.x + NODE_W; const y1 = a.y + NODE_H / 2; const x2 = b.x; const y2 = b.y + NODE_H / 2;
            const mx = (x1 + x2) / 2;
            return <path key={`${e.from}>${e.to}`} className={`edge ${e.kind === 'normal' ? '' : e.kind}`} d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`} />;
          })}
          {g.nodes.map((n) => (
            <g key={n.id} className={`node ${n.flag ? 'flag' : ''} ${n.ghost ? 'ghost' : ''}`} transform={`translate(${n.x},${n.y})`} tabIndex={0} role="button"
              aria-label={n.title} onClick={() => activate(n.id, n.ghost)} onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); activate(n.id, n.ghost); } }}>
              <title>{n.ghost ? `${n.title}. Click to draft one.` : n.title}</title>
              <rect width={NODE_W} height={NODE_H} rx={4} />
              {!n.ghost && n.role && <rect width={4} height={NODE_H} rx={2} style={{ fill: ROLE_COLOUR[n.role], stroke: 'none' }} />}
              {n.ghost
                ? <text x={12} y={25} style={{ fill: 'var(--lamp-red)', fontWeight: 600 }}>No verifying test. Draft one</text>
                : <><text className="k" x={12} y={16}>{n.role} {n.key}</text><text x={12} y={31} style={{ fill: 'var(--text-subtle)' }}>{n.label}</text></>}
            </g>
          ))}
        </svg>
      </div>
    </>
  );
}
