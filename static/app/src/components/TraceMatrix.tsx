import type { GateResult, TraceSnapshot } from '../types';
import { RoleBadge } from './ui';

export function TraceMatrix({ snap, gate }: { snap: TraceSnapshot; gate: GateResult }) {
  const inc = (k: string, role: string) => snap.links.filter((l) => l.to === k && l.role === role).map((l) => l.from).filter((x) => snap.items[x]);
  const out = (k: string, role: string) => snap.links.filter((l) => l.from === k && l.role === role).map((l) => l.to).filter((x) => snap.items[x]);
  const latest = (t: string) => (snap.executions[t] ?? []).filter((e) => e.version === snap.release).sort((a, b) => (a.executedAt < b.executedAt ? 1 : -1))[0];
  const suspectTests = new Set(gate.findings.filter((f) => f.ruleId === 'R6').map((f) => f.keys[0]));

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="matrix">
        <thead>
          <tr><th>Safety requirement</th><th>ASIL</th><th>Hazards</th><th>Implementation</th><th>Verification</th><th>Result on {snap.release}</th></tr>
        </thead>
        <tbody>
          {gate.scope.map((k) => {
            const r = snap.items[k];
            const hz = out(k, 'mitigates').filter((x) => snap.items[x].role === 'HAZ');
            const dec = out(k, 'derivedFrom');
            const impl = inc(k, 'implements').filter((x) => snap.items[x].role === 'IMP');
            const tests = inc(k, 'verifies').filter((x) => snap.items[x].role === 'TC');
            const passed = tests.filter((t) => latest(t)?.result === 'Passed').length;
            const implDone = impl.length > 0 && impl.every((x) => snap.items[x].statusCategory === 'done');
            const suspect = tests.filter((t) => suspectTests.has(t));
            return (
              <tr key={k}>
                <td><RoleBadge role="REQ" k={k} /><div className="sum small">{r.summary}</div></td>
                <td>{r.asil ?? '—'}</td>
                <td className="cell">{hz.length || dec.length ? [...hz, ...dec].map((x) => <div key={x}><RoleBadge role={snap.items[x].role} k={x} /></div>) : <span className="cell-warn">None</span>}</td>
                <td className="cell">{impl.length ? <span className={implDone ? 'cell-ok' : 'cell-warn'}>{implDone ? 'Done' : 'In progress'} ({impl.length})</span> : <span className="cell-bad">Missing</span>}</td>
                <td className="cell">{tests.length ? tests.map((t) => <div key={t}><RoleBadge role="TC" k={t} /></div>) : <span className="cell-bad">No test</span>}</td>
                <td className="cell">
                  {tests.length === 0 ? '—' : <span className={passed === tests.length && !suspect.length ? 'cell-ok' : 'cell-bad'}>{passed} of {tests.length} passed</span>}
                  {suspect.length > 0 && <div className="cell-warn small">{suspect.length} suspect</div>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
