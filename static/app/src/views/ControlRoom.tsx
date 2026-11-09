import { useCallback, useEffect, useState } from 'react';
import { api, openUrl, type ContextInfo } from '../api';
import { Coverage } from '../components/Coverage';
import { DemoLoader } from '../components/DemoLoader';
import { Findings } from '../components/Findings';
import { FixDrawer } from '../components/FixDrawer';
import { StartLights } from '../components/StartLights';
import { TraceGraph } from '../components/TraceGraph';
import { TraceMatrix } from '../components/TraceMatrix';
import { Dialog, Toast } from '../components/ui';
import type { EvidenceRecord, Finding, Readiness, Signoff } from '../types';

type Tab = 'findings' | 'graph' | 'matrix' | 'evidence';
const ROLES: Signoff['role'][] = ['Safety Manager', 'Test Lead', 'Release Manager'];

export function ControlRoom({ projectKey: initialProject }: { projectKey?: string }) {
  const [ctx, setCtx] = useState<ContextInfo | null>(null);
  const [projectKey, setProjectKey] = useState(initialProject);
  const [releases, setReleases] = useState<{ name: string; released: boolean }[]>([]);
  const [release, setRelease] = useState<string>();
  const [data, setData] = useState<Readiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('findings');
  const [fix, setFix] = useState<Finding | null>(null);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [evidence, setEvidence] = useState<EvidenceRecord[]>([]);
  const [signoffs, setSignoffs] = useState<Signoff[]>([]);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const load = useCallback(async (p = projectKey, r = release) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.readiness(p, r);
      setData(res);
      setRelease(res.release);
      setProjectKey(res.projectKey);
      api.listEvidence(res.projectKey, res.release).then(setEvidence).catch(() => undefined);
      api.signoffs(res.projectKey, res.release).then(setSignoffs).catch(() => undefined);
    } catch (e) {
      setError((e as Error).message);
      setData(null);
    } finally { setLoading(false); }
  }, [projectKey, release]);

  useEffect(() => {
    (async () => {
      try {
        const c = await api.context();
        setCtx(c);
        const p = initialProject ?? c.projectKey;
        setProjectKey(p);
        if (p) { setReleases(await api.releases(p)); await load(p, undefined); } else setLoading(false);
      } catch (e) { setError((e as Error).message); setLoading(false); }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isDemo = !!ctx && !!projectKey && ctx.settings.demoProject === projectKey;
  const notify = (text: string, isError = false) => setToast({ text, error: isError });

  const ask = async (f: Finding) => {
    const prompt = `Explain finding ${f.id} for ${release} and tell me how to fix it.`;
    try { await navigator.clipboard.writeText(prompt); notify('Prompt copied. Paste it into Rovo chat with the Scrutineer agent.'); }
    catch { notify(`Ask the Scrutineer agent in Rovo: “${prompt}”`); }
  };

  const publish = async () => {
    if (!projectKey || !release) return;
    setPublishing(true);
    try {
      const rec = await api.publishEvidence(projectKey, release);
      setEvidence((e) => [rec, ...e]);
      setConfirmPublish(false);
      setTab('evidence');
      notify(`Published “${rec.title}” to Confluence.`);
    } catch (e) { notify((e as Error).message, true); } finally { setPublishing(false); }
  };

  const doSignOff = async (role: Signoff['role']) => {
    if (!projectKey || !release) return;
    try { setSignoffs(await api.signOff(projectKey, release, role)); notify(`Signed off as ${role}.`); } catch (e) { notify((e as Error).message, true); }
  };

  const onDemoReady = async (p: string) => {
    setProjectKey(p);
    try {
      const c = await api.context();
      setCtx(c);
      setReleases(await api.releases(p));
    } catch { /* keep going */ }
    await load(p, undefined);
  };

  const gate = data?.gate;
  const blocking = gate?.findings.filter((f) => f.severity === 'blocking').length ?? 0;
  const other = (gate?.findings.length ?? 0) - blocking;
  const noScope = !!gate && gate.scope.length === 0;

  return (
    <div>
      <div className="toolbar">
        <div className="title"><h1>Release gate</h1>{projectKey && <span className="muted">{projectKey}</span>}</div>
        {releases.length > 0 && (
          <label className="row small"><span className="muted">Release</span>
            <select value={release ?? ''} onChange={(e) => { setRelease(e.target.value); void load(projectKey, e.target.value); }} aria-label="Release">
              {releases.map((r) => <option key={r.name} value={r.name}>{r.name}{r.released ? ' (released)' : ''}</option>)}
            </select>
          </label>
        )}
        <span className="muted small">Profile: ISO 26262</span>
        <span className="spacer" />
        <button className="btn subtle" onClick={() => load()} disabled={loading || !projectKey}>Refresh</button>
        <button className="btn primary" onClick={() => setConfirmPublish(true)} disabled={!gate || noScope}>Publish evidence pack</button>
      </div>

      {loading && !data && <div className="skeleton" aria-label="Loading" />}

      {!loading && (error || noScope) && (
        <div className="empty stack">
          <h2>{noScope ? `No safety requirements are in scope for ${release}` : 'Scrutineer has nothing to inspect yet'}</h2>
          <p className="muted">{noScope ? 'Set this fix version on the safety requirements delivered in the release, or load the demo to see a full safety program.' : error}</p>
          <div style={{ display: 'inline-block', textAlign: 'left' }}><DemoLoader compact onReady={onDemoReady} /></div>
        </div>
      )}

      {gate && !noScope && data && (
        <>
          <StartLights verdict={gate.verdict} lights={gate.lights}>
            <span>Readiness</span><b>{gate.score} / 100</b>
            <span>Blocking findings</span><b>{blocking}</b>
            <span>Other findings</span><b>{other}</b>
            <span>Requirements in scope</span><b>{gate.stats.requirements}</b>
          </StartLights>
          <Coverage s={gate.stats} />

          <div className="tabs" role="tablist">
            {([['findings', 'Findings', gate.findings.length], ['graph', 'Trace graph'], ['matrix', 'Matrix'], ['evidence', 'Evidence and sign-off', evidence.length]] as [Tab, string, number?][]).map(([id, label, count]) => (
              <button key={id} role="tab" aria-selected={tab === id} className="tab" onClick={() => setTab(id)}>
                {label}{count !== undefined && <span className="count">{count}</span>}
              </button>
            ))}
          </div>

          {tab === 'findings' && <Findings findings={gate.findings} isDemo={isDemo} onFix={setFix} onAsk={ask} />}
          {tab === 'graph' && <TraceGraph snap={data.snap} gate={gate} onGhost={(req) => { const f = gate.findings.find((x) => x.ruleId === 'R4' && x.keys[0] === req); if (f) setFix(f); }} />}
          {tab === 'matrix' && <TraceMatrix snap={data.snap} gate={gate} />}
          {tab === 'evidence' && (
            <div className="stack">
              <section>
                <h2>Sign-off</h2>
                {gate.verdict !== 'GO'
                  ? <p className="muted">Sign-off opens when the gate is GO. Each sign-off is tied to the exact snapshot it approved.</p>
                  : (
                    <div className="row">
                      {ROLES.map((role) => {
                        const s = signoffs.find((x) => x.role === role && x.hash === data.hash);
                        return s
                          ? <span key={role} className="banner ok" style={{ margin: 0 }}>{role}: {s.name}, {s.at.slice(0, 16).replace('T', ' ')} UTC</span>
                          : <button key={role} className="btn" onClick={() => doSignOff(role)}>Sign off as {role}</button>;
                      })}
                    </div>
                  )}
              </section>
              <section>
                <h2>Evidence packs</h2>
                {evidence.length === 0 ? <p className="muted">No evidence pack for {release} yet. Publishing creates a Confluence page with the matrix, findings, suspect-link history, sign-offs and a SHA-256 fingerprint.</p> : (
                  <table className="matrix"><thead><tr><th>Page</th><th>Verdict</th><th>Fingerprint</th><th>By</th></tr></thead><tbody>
                    {evidence.map((e) => <tr key={e.at}><td><button className="linklike" onClick={() => openUrl(e.url)}>{e.title}</button></td><td>{e.verdict.replace('_', '-')}</td><td><code className="small">{e.hash.slice(0, 16)}</code></td><td>{e.by}</td></tr>)}
                  </tbody></table>
                )}
              </section>
            </div>
          )}
        </>
      )}

      <footer className="disclaimer">Scrutineer supports evidence gathering. It does not certify compliance.</footer>

      {fix && data && projectKey && release && (
        <FixDrawer finding={fix} snap={data.snap} projectKey={projectKey} release={release} onClose={() => setFix(null)}
          onDone={(m) => { setFix(null); notify(m); void load(); }} onError={(m) => notify(m, true)} />
      )}
      {confirmPublish && (
        <Dialog title={`Publish the evidence pack for ${release}?`} onClose={() => setConfirmPublish(false)} footer={<>
          <button className="btn subtle" onClick={() => setConfirmPublish(false)} disabled={publishing}>Cancel</button>
          <button className="btn primary" onClick={publish} disabled={publishing}>{publishing ? 'Publishing…' : 'Publish evidence pack'}</button>
        </>}>
          <p>Creates a new Confluence page with the current verdict ({gate?.verdict.replace('_', '-')}), the traceability matrix, findings, suspect-link history and sign-offs.</p>
          <div className="will">Scrutineer stores the evaluated snapshot and prints its SHA-256 fingerprint on the page, so anyone can check the page matches the evidence.</div>
        </Dialog>
      )}
      {toast && <Toast text={toast.text} error={toast.error} onDone={() => setToast(null)} />}
    </div>
  );
}
