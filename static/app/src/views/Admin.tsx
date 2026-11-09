import { useEffect, useState } from 'react';
import { api } from '../api';
import { DemoLoader } from '../components/DemoLoader';
import { Toast } from '../components/ui';

export function Admin() {
  const [settings, setSettings] = useState<{ defaultProject?: string; evidenceSpaceKey?: string; demoProject?: string }>({});
  const [ingest, setIngest] = useState<{ url: string; token: string; projectKey?: string; exampleTestKey?: string } | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = () => {
    api.settings().then(setSettings).catch((e) => setToast({ text: e.message, error: true }));
    api.ingestInfo().then(setIngest).catch(() => undefined);
  };
  useEffect(refresh, []);

  const save = async () => {
    setSaving(true);
    try { await api.saveSettings({ defaultProject: settings.defaultProject?.toUpperCase() || undefined, evidenceSpaceKey: settings.evidenceSpaceKey?.toUpperCase() || undefined }); setToast({ text: 'Settings saved.' }); refresh(); }
    catch (e) { setToast({ text: (e as Error).message, error: true }); } finally { setSaving(false); }
  };

  const token = ingest ? (showToken ? ingest.token : '•'.repeat(12)) : '';
  const curl = ingest ? `curl -X POST "${ingest.url}" \\
  -H "Content-Type: application/json" \\
  -H "x-scrutineer-token: ${showToken ? ingest.token : '$SCRUTINEER_TOKEN'}" \\
  -d '{"projectKey":"${ingest.projectKey ?? 'BBW'}","version":"BBW 2.3","runId":"1181","runUrl":"https://ci.example.com/hil/1181","results":[{"testKey":"${ingest.exampleTestKey ?? 'YOUR-TEST-KEY'}","result":"passed"}]}'` : '';

  return (
    <div className="admin">
      <h1>Scrutineer</h1>
      <p className="muted">Traceability release gate for safety-critical software. ISO 26262 profile.</p>

      <section className="section">
        <h2>Demo project</h2>
        <DemoLoader onReady={() => refresh()} />
      </section>

      <section className="section">
        <h2>Settings</h2>
        <label className="field"><span>Default project</span>
          <input type="text" value={settings.defaultProject ?? ''} onChange={(e) => setSettings({ ...settings, defaultProject: e.target.value })} placeholder="BBW" /></label>
        <label className="field"><span>Confluence space for evidence packs</span>
          <input type="text" value={settings.evidenceSpaceKey ?? ''} onChange={(e) => setSettings({ ...settings, evidenceSpaceKey: e.target.value })} placeholder="BBWSAFE" /></label>
        <p className="small muted">The Rovo agent and MCP tools use the default project when no project is named. Scrutineer reads the role, ASIL and reviewer of each issue from its Scrutineer panel.</p>
        <button className="btn primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</button>
      </section>

      <section className="section">
        <h2>CI and HIL bench results</h2>
        <p>Post test results from your pipeline to this web trigger. Results are recorded as CI evidence against the release you name.</p>
        {ingest && (
          <>
            <label className="field"><span>Web trigger URL</span><div className="code">{ingest.url}</div></label>
            <label className="field"><span>Token (send as the x-scrutineer-token header)</span>
              <div className="row"><div className="code" style={{ flex: 1 }}>{token}</div><button className="btn small" onClick={() => setShowToken((s) => !s)}>{showToken ? 'Hide token' : 'Show token'}</button></div></label>
            <label className="field"><span>Example</span><div className="code">{curl}</div></label>
            {!showToken && <p className="small muted">Click Show token to put your real token into the example, or set SCRUTINEER_TOKEN in your shell.</p>}
          </>
        )}
      </section>

      <section className="section">
        <h2>Rovo agent and MCP</h2>
        <p>Open Rovo chat and choose the Scrutineer agent. Try “Is the current release ready to ship?” or “Draft the missing test case”. The agent always shows a draft and asks before it creates anything.</p>
        <p>External AI assistants can call the read-only Scrutineer tools over MCP after an admin enables external MCP access for this app.</p>
      </section>

      <footer className="disclaimer">Scrutineer supports evidence gathering. It does not certify compliance. All data stays in your Atlassian site.</footer>
      {toast && <Toast text={toast.text} error={toast.error} onDone={() => setToast(null)} />}
    </div>
  );
}
