import type { Finding, FixType } from '../types';
import { BadgedText } from './ui';

const RULE_TITLES: Record<string, { title: string; clause: string }> = {
  R0: { title: 'Release has safety scope', clause: 'ISO 26262-8 §6' },
  R1: { title: 'Every ASIL-rated hazard is mitigated', clause: 'ISO 26262-3 §7' },
  R2: { title: 'Every requirement traces upward', clause: 'ISO 26262-8 §6.4.3' },
  R3: { title: 'Every requirement is implemented', clause: 'ISO 26262-6 §7–9' },
  R4: { title: 'Every requirement is verified', clause: 'ISO 26262-6 §9' },
  R5: { title: 'Every test passed on this release', clause: 'ISO 26262-6 §9.4' },
  R6: { title: 'No suspect verification links', clause: 'ISO 26262-8 §8' },
  R7: { title: 'Independent review for ASIL C/D', clause: 'ISO 26262-2 §6.4.7' },
  R8: { title: 'No open defects block safety requirements', clause: 'ISO 26262-8 §7' },
  R9: { title: 'Requirement ASIL consistent with hazards', clause: 'ISO 26262-9 §5' },
};

export function fixLabel(fix: FixType, isDemo: boolean): string | null {
  switch (fix) {
    case 'create_test': return 'Draft test case';
    case 'run_test': return isDemo ? 'Run on bench (simulated)' : null;
    case 'resolve_suspect': return 'Record impact review';
    case 'assign_reviewer': return 'Assign reviewer';
    case 'resolve_defect': return 'Close defect';
    default: return null;
  }
}

const SEV = { blocking: 'Blocking', major: 'Major', minor: 'Minor' } as const;

export function Findings({ findings, isDemo, onFix, onAsk }: {
  findings: Finding[]; isDemo: boolean; onFix: (f: Finding) => void; onAsk: (f: Finding) => void;
}) {
  if (!findings.length) {
    return <div className="clean"><h3>Every check passed</h3><p className="muted">All hazards are mitigated, every requirement is implemented and verified, and every test passed on this release.</p></div>;
  }
  return (
    <ul className="findings">
      {findings.map((f) => {
        const label = fixLabel(f.fix, isDemo);
        const rule = RULE_TITLES[f.ruleId];
        return (
          <li key={f.id} className={`finding ${f.severity}`}>
            <span className="edge" aria-hidden="true" />
            <div>
              <div className="msg"><BadgedText text={f.message} /></div>
              <div className="meta"><span className={`sev ${f.severity}`}>{SEV[f.severity]}</span>, rule {f.ruleId}{rule ? `: ${rule.title} (${rule.clause})` : ''}</div>
            </div>
            <div className="actions">
              <button className="btn subtle small" onClick={() => onAsk(f)} title="Copy a prompt for the Scrutineer agent in Rovo">Ask Scrutineer</button>
              {label && <button className="btn small" onClick={() => onFix(f)}>{label}</button>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
