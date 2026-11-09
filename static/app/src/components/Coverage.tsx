import type { GateStats } from '../types';

function Metric({ label, num, den, invert }: { label: string; num: number; den?: number; invert?: boolean }) {
  const pct = den === undefined ? (num === 0 ? 100 : 0) : den === 0 ? 100 : Math.round((num / den) * 100);
  const cls = invert ? (num === 0 ? '' : 'zero') : pct === 100 ? '' : pct === 0 ? 'zero' : 'partial';
  return (
    <div>
      <div className="num">{num}{den !== undefined && <small> / {den}</small>}</div>
      <div className="lbl">{label}</div>
      <div className="bar"><i className={cls} style={{ width: invert ? '100%' : `${pct}%` }} /></div>
    </div>
  );
}

export function Coverage({ s }: { s: GateStats }) {
  return (
    <section className="coverage" aria-label="Coverage">
      <Metric label="Hazards mitigated" num={s.hazardsMitigated} den={s.hazards} />
      <Metric label="Requirements verified" num={s.requirementsVerified} den={s.requirements} />
      <Metric label="Tests passing on release" num={s.testsPassing} den={s.tests} />
      <Metric label="Suspect links" num={s.suspects} invert />
      <Metric label="Open blocking defects" num={s.openBlockers} invert />
    </section>
  );
}
