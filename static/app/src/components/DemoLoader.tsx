import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { DemoStatus } from '../types';
import { Dialog } from './ui';

export function DemoLoader({ onReady, compact }: { onReady?: (projectKey: string) => void; compact?: boolean }) {
  const [status, setStatus] = useState<DemoStatus | null>(null);
  const [error, setError] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval>>();

  const poll = () => {
    clearInterval(timer.current);
    timer.current = setInterval(async () => {
      try {
        const s = await api.demoStatus();
        setStatus(s);
        if (s.state !== 'running') {
          clearInterval(timer.current);
          if ((s.state === 'created' || s.state === 'exists' || s.state === 'partial') && s.projectKey) onReady?.(s.projectKey);
        }
      } catch (e) { setError((e as Error).message); clearInterval(timer.current); }
    }, 2500);
  };

  useEffect(() => {
    api.demoStatus().then((s) => { setStatus(s); if (s.state === 'running') poll(); }).catch(() => undefined);
    return () => clearInterval(timer.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async (reset = false) => {
    setError('');
    setConfirmReset(false);
    try { await (reset ? api.resetDemo() : api.loadDemo()); setStatus({ state: 'running', steps: [], at: new Date().toISOString() }); poll(); } catch (e) { setError((e as Error).message); }
  };

  const running = status?.state === 'running';
  return (
    <div>
      {!compact && <p>Creates the Brake-by-Wire ECU project (key BBW) with hazards, safety requirements, implementation stories, test cases with HIL results, a defect and Confluence specs. Release BBW 2.2 is green and BBW 2.3 has four planted problems to fix.</p>}
      <div className="row">
        <button className="btn primary" onClick={() => start(false)} disabled={running}>{running ? 'Loading demo…' : 'Load demo project'}</button>
        {!compact && status && ['created', 'exists', 'partial', 'failed'].includes(status.state) && <button className="btn subtle" onClick={() => setConfirmReset(true)} disabled={running}>Reset demo</button>}
        {running && <span className="muted small">This takes about a minute.</span>}
      </div>
      {error && <p className="banner warn" style={{ marginTop: 8 }}>{error}</p>}
      {status && status.steps.length > 0 && (
        <ul className="steps">
          {status.steps.map((s) => <li key={s.name}><span className={s.ok ? 'ok' : 'bad'}>{s.ok ? 'Done' : 'Failed'}</span> {s.name}{s.detail ? <span className="muted">: {s.detail}</span> : null}</li>)}
          {status.state === 'failed' && <li className="bad">Loading stopped. Fix the failed step (often a missing admin permission) and load again.</li>}
        </ul>
      )}
      {confirmReset && (
        <Dialog title="Reset the demo?" onClose={() => setConfirmReset(false)} footer={<>
          <button className="btn subtle" onClick={() => setConfirmReset(false)}>Cancel</button>
          <button className="btn primary" onClick={() => start(true)}>Delete demo data</button>
        </>}>
          <p>Deletes every issue labelled scrutineer-demo and the stored test history for the demo project. Confluence pages stay. You can load the demo again afterwards.</p>
        </Dialog>
      )}
    </div>
  );
}
