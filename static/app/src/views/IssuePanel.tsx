import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { BadgedText, Dialog, RoleBadge, Toast } from '../components/ui';
import type { Asil, Execution, IssueTrace, LinkRole, Role } from '../types';

const ROLE_NAMES: Record<Role, string> = { HAZ: 'Hazard', REQ: 'Safety requirement', IMP: 'Implementation', TC: 'Test case', DEF: 'Defect', DEC: 'Safety decision' };
const REL_TEXT: Record<LinkRole, { out: string; in: string }> = {
  mitigates: { out: 'mitigates', in: 'mitigated by' }, implements: { out: 'implements', in: 'implemented by' },
  verifies: { out: 'verifies', in: 'verified by' }, derivedFrom: { out: 'derived from', in: 'source of' }, blocks: { out: 'blocks', in: 'blocked by' },
};
const SOURCE = (e: Execution) => (e.source === 'bench-sim' ? 'Simulated HIL bench' : e.source === 'manual' ? `Manual attestation by ${e.actor}` : e.actor);

export function IssuePanel({ issueKey }: { issueKey: string }) {
  const [t, setT] = useState<IssueTrace | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [dialog, setDialog] = useState<null | 'manual' | 'review' | 'bench'>(null);
  const [result, setResult] = useState<'Passed' | 'Failed'>('Passed');
  const [note, setNote] = useState('');
  const [justification, setJustification] = useState('');
  const [version, setVersion] = useState('');

  const load = useCallback(async () => {
    try { const r = await api.issueTrace(issueKey); setT(r); setVersion((v) => v || r.item?.fixVersions[0] || ''); setError(''); } catch (e) { setError((e as Error).message); }
  }, [issueKey]);
  useEffect(() => { void load(); }, [load]);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); setToast({ text: ok }); setDialog(null); setNote(''); setJustification(''); await load(); } catch (e) { setToast({ text: (e as Error).message, error: true }); } finally { setBusy(false); }
  };

  if (error) return <p className="banner warn">{error}</p>;
  if (!t) return <div className="skeleton" style={{ height: 60 }} />;

  if (!t.item) {
    return (
      <div className="panel">
        <p className="muted">This issue is not part of a safety trace yet. Give it a role to include it.</p>
        <div className="row">
          {(['HAZ', 'REQ', 'IMP', 'TC', 'DEF', 'DEC'] as Role[]).map((r) => (
            <button key={r} className="btn small" disabled={busy} onClick={() => act(() => api.setIssueMeta(issueKey, { role: r }), `Marked as ${ROLE_NAMES[r].toLowerCase()}.`)}>{ROLE_NAMES[r]}</button>
          ))}
        </div>
        {toast && <Toast text={toast.text} error={toast.error} onDone={() => setToast(null)} />}
      </div>
    );
  }

  const it = t.item;
  const openSuspects = (t.suspects ?? []).filter((s) => !s.resolved && !(t.executions ?? []).some((e) => it.fixVersions.includes(e.version) && e.executedAt > s.changedAt));
  const latestByVersion = (v: string) => (t.executions ?? []).find((e) => e.version === v);

  return (
    <div className="panel">
      <div className="row" style={{ marginBottom: 8 }}>
        <RoleBadge role={it.role} k={it.key} link={false} />
        <span className="muted small">{ROLE_NAMES[it.role]}</span>
        <span className="spacer" />
        {(it.role === 'HAZ' || it.role === 'REQ') && (
          <label className="row small"><span className="muted">ASIL</span>
            <select value={it.asil ?? ''} disabled={busy} aria-label="ASIL"
              onChange={(e) => act(async () => {
                const r = await api.setIssueMeta(issueKey, { asil: e.target.value as Asil });
                if (r.flagged.length) setToast({ text: `ASIL changed. ${r.flagged.length} downstream test(s) marked suspect.` });
              }, 'ASIL updated.')}>
              {!it.asil && <option value="">Not set</option>}
              {(['QM', 'A', 'B', 'C', 'D'] as Asil[]).map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
        )}
      </div>

      {it.superseded && <p className="banner info">Superseded. Excluded from release scope.</p>}
      {openSuspects.length > 0 && (
        <div className="banner warn">
          {openSuspects.map((s) => <div key={s.upstreamKey + s.changedAt}><BadgedText text={`Suspect: ${s.reason}`} />, by {s.changedBy} on {s.changedAt.slice(0, 10)}.</div>)}
          <div className="row" style={{ marginTop: 6 }}>
            <button className="btn small" onClick={() => setDialog('review')}>Record impact review</button>
            <span className="small">or record a new run below.</span>
          </div>
        </div>
      )}

      {(t.links ?? []).length > 0 ? (
        <ul className="chain">
          {(t.links ?? []).map((l, i) => (
            <li key={i}><span className="rel">{REL_TEXT[l.role][l.direction]}</span><RoleBadge role={l.other.role} k={l.other.key} /><span className="muted small">{l.other.summary}</span></li>
          ))}
        </ul>
      ) : <p className="muted small">No trace links yet.</p>}
      {(t.downstream ?? []).length > 0 && ['HAZ', 'REQ', 'DEC'].includes(it.role) && (
        <p className="small muted">Changing this {ROLE_NAMES[it.role].toLowerCase()} would mark {(t.downstream ?? []).filter((d) => d.role === 'TC').length} test case(s) suspect.</p>
      )}

      {it.role === 'TC' && (
        <>
          <h3 style={{ marginTop: 12 }}>Executions</h3>
          {it.fixVersions.length > 0 && (
            <p className="small muted">Latest on {version || it.fixVersions[0]}: {latestByVersion(version || it.fixVersions[0])?.result ?? 'Not run'}</p>
          )}
          {(t.executions ?? []).slice(0, 6).map((e) => (
            <div key={e.executedAt + e.source} className="exec">
              <span className={`r ${e.result}`}>{e.result}</span>
              <span>{e.version}, {e.executedAt.slice(0, 16).replace('T', ' ')} UTC<br /><span className="muted">{SOURCE(e)}{e.reference && e.source !== 'manual' ? ` (${e.reference})` : ''}</span></span>
            </div>
          ))}
          {(t.executions ?? []).length === 0 && <p className="muted small">Never executed.</p>}
          <div className="row" style={{ marginTop: 8 }}>
            {t.isDemo && <button className="btn small" disabled={busy} onClick={() => setDialog('bench')}>Run on HIL bench (simulated)</button>}
            <button className="btn small subtle" disabled={busy} onClick={() => setDialog('manual')}>Record manual result</button>
          </div>
        </>
      )}

      {it.role === 'IMP' && (
        <p className="small" style={{ marginTop: 8 }}>Reviewer: {it.reviewerName ?? (it.reviewerId ? (it.reviewerId === it.assigneeId ? 'the assignee (not independent)' : 'recorded') : 'none recorded')}</p>
      )}

      {dialog === 'bench' && (
        <Dialog title={`Run ${it.key} on the HIL bench`} onClose={() => setDialog(null)} footer={<>
          <button className="btn subtle" onClick={() => setDialog(null)}>Cancel</button>
          <button className="btn primary" disabled={busy || !version} onClick={() => act(() => api.runBench(issueKey, version), 'Simulated bench run recorded.')}>Run simulated bench</button>
        </>}>
          <VersionPick versions={it.fixVersions} value={version} onChange={setVersion} />
          <div className="will">Records a simulated HIL bench execution. The evidence pack labels it “simulated HIL bench”.</div>
        </Dialog>
      )}
      {dialog === 'manual' && (
        <Dialog title={`Record a manual result for ${it.key}`} onClose={() => setDialog(null)} footer={<>
          <button className="btn subtle" onClick={() => setDialog(null)}>Cancel</button>
          <button className="btn primary" disabled={busy || !version} onClick={() => act(() => api.recordManual(issueKey, version, result, note), 'Manual result recorded.')}>Record result</button>
        </>}>
          <VersionPick versions={it.fixVersions} value={version} onChange={setVersion} />
          <label className="field"><span>Result</span>
            <select value={result} onChange={(e) => setResult(e.target.value as 'Passed' | 'Failed')}><option>Passed</option><option>Failed</option></select></label>
          <label className="field"><span>Note or report link (optional)</span><input type="text" style={{ width: '100%' }} value={note} onChange={(e) => setNote(e.target.value)} /></label>
          <div className="will">Recorded as a manual attestation under your name. CI results are preferred evidence.</div>
        </Dialog>
      )}
      {dialog === 'review' && (
        <Dialog title={`Impact review for ${it.key}`} onClose={() => setDialog(null)} footer={<>
          <button className="btn subtle" onClick={() => setDialog(null)}>Cancel</button>
          <button className="btn primary" disabled={busy || justification.trim().length < 10} onClick={() => act(() => api.resolveSuspect(issueKey, justification), 'Impact review recorded.')}>Record impact review</button>
        </>}>
          <p>Confirm this test still verifies the changed requirement as written, and say why.</p>
          <label className="field"><span>Justification (required)</span><textarea value={justification} onChange={(e) => setJustification(e.target.value)} /></label>
        </Dialog>
      )}
      {toast && <Toast text={toast.text} error={toast.error} onDone={() => setToast(null)} />}
    </div>
  );
}

function VersionPick({ versions, value, onChange }: { versions: string[]; value: string; onChange: (v: string) => void }) {
  if (!versions.length) return <p className="banner warn">Set a fix version on this test case first.</p>;
  return (
    <label className="field"><span>Release tested</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>{versions.map((v) => <option key={v}>{v}</option>)}</select>
    </label>
  );
}
