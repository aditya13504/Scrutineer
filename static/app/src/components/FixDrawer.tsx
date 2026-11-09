import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Finding, TestDraft, TraceSnapshot } from '../types';
import { Dialog } from './ui';

interface Props {
  finding: Finding;
  snap: TraceSnapshot;
  projectKey: string;
  release: string;
  onClose: () => void;
  onDone: (message: string) => void;
  onError: (message: string) => void;
}

const lbl = (snap: TraceSnapshot, k: string) => (snap.items[k] ? `${snap.items[k].role} ${k}` : k);

export function FixDrawer({ finding, snap, projectKey, release, onClose, onDone, onError }: Props) {
  const target = finding.keys[0];
  const item = snap.items[target];
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<TestDraft | null>(null);
  const [justification, setJustification] = useState('');
  const [reviewers, setReviewers] = useState<{ accountId: string; displayName: string }[]>([]);
  const [reviewer, setReviewer] = useState('');

  useEffect(() => {
    if (finding.fix === 'create_test') api.draftTest(projectKey, target).then((r) => setDraft(r.draft)).catch((e) => onError(e.message));
    if (finding.fix === 'assign_reviewer') {
      api.reviewerOptions(projectKey).then((list) => {
        const ok = list.filter((u) => u.accountId !== item?.assigneeId);
        setReviewers(ok);
        setReviewer(ok[0]?.accountId ?? '');
      }).catch((e) => onError(e.message));
    }
  }, [finding.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run() {
    setBusy(true);
    try {
      const input: Record<string, unknown> = {};
      if (finding.fix === 'create_test') input.draft = draft;
      if (finding.fix === 'resolve_suspect') input.justification = justification;
      if (finding.fix === 'assign_reviewer') {
        input.reviewerId = reviewer;
        input.reviewerName = reviewers.find((r) => r.accountId === reviewer)?.displayName;
      }
      const r = await api.applyFix(projectKey, release, finding.id, input);
      onDone(r.message);
    } catch (e) {
      onError((e as Error).message);
      setBusy(false);
    }
  }

  let title = 'Fix finding';
  let confirm = 'Apply';
  let canRun = true;
  let body: JSX.Element = <></>;

  switch (finding.fix) {
    case 'create_test':
      title = `Draft a test case for ${lbl(snap, target)}`;
      confirm = 'Create test case';
      canRun = !!draft && draft.summary.trim().length > 0 && draft.steps.length > 0;
      body = !draft ? <div className="skeleton" /> : (
        <>
          <p className="muted small">{item?.summary}{item?.asil ? `, ASIL ${item.asil}` : ''}. This draft is rule-based. Edit anything before creating it.</p>
          <label className="field"><span>Summary</span>
            <input type="text" style={{ width: '100%' }} value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} /></label>
          <label className="field"><span>Steps, one per line</span>
            <textarea rows={7} value={draft.steps.join('\n')} onChange={(e) => setDraft({ ...draft, steps: e.target.value.split('\n').filter((s) => s.trim()) })} /></label>
          <label className="field"><span>Expected result</span>
            <textarea rows={2} value={draft.expected} onChange={(e) => setDraft({ ...draft, expected: e.target.value })} /></label>
          <div className="will">Creates a test case in {projectKey} with fix version {release} and links it: verifies {lbl(snap, target)}. It stays “Not run” until a CI, bench or manual result is recorded, so the gate stays red until then.</div>
        </>
      );
      break;
    case 'run_test':
      title = `Run ${lbl(snap, target)} on the HIL bench`;
      confirm = 'Run simulated bench';
      body = <><p>{item?.summary}</p><div className="will">Records a <strong>simulated</strong> HIL bench execution for {release}. It goes through the same path as CI results, and the evidence pack labels it “simulated HIL bench”.</div></>;
      break;
    case 'resolve_suspect':
      title = `Impact review for ${lbl(snap, target)}`;
      confirm = 'Record impact review';
      canRun = justification.trim().length >= 10;
      body = (
        <>
          <p><strong>{finding.keys.slice(1).map((k) => lbl(snap, k)).join(', ')}</strong> changed after this test last ran. Confirm the test still verifies the requirement as written, and say why.</p>
          {(snap.suspects.filter((s) => s.testKey === target && !s.resolved)).map((s) => <p key={s.upstreamKey + s.changedAt} className="small muted">{s.reason}, by {s.changedBy} on {s.changedAt.slice(0, 10)}</p>)}
          <label className="field"><span>Justification (required)</span>
            <textarea value={justification} onChange={(e) => setJustification(e.target.value)} placeholder="Example: wording clarified only; thresholds and timing are unchanged, so the existing test still covers the requirement." /></label>
          <div className="will">Stores your name, the time and this justification. The evidence pack shows it in the suspect-link history. To re-test instead, record a new run on the test case.</div>
        </>
      );
      break;
    case 'assign_reviewer':
      title = `Independent reviewer for ${lbl(snap, target)}`;
      confirm = 'Assign reviewer';
      canRun = !!reviewer;
      body = (
        <>
          <p>{item?.summary}. Assignee: {item?.assigneeName ?? 'unassigned'}. ISO 26262 asks for review by someone other than the author for ASIL C and D work.</p>
          <label className="field"><span>Reviewer</span>
            <select value={reviewer} onChange={(e) => setReviewer(e.target.value)} style={{ width: '100%' }}>
              {reviewers.map((r) => <option key={r.accountId} value={r.accountId}>{r.displayName}</option>)}
            </select></label>
          <div className="will">Records the reviewer on {lbl(snap, target)}.</div>
        </>
      );
      break;
    case 'resolve_defect':
      title = `Close ${lbl(snap, target)}`;
      confirm = 'Close defect';
      body = <><p>{item?.summary}</p><div className="will">Moves {lbl(snap, target)} to its done status in Jira, as you. Only do this if the fix is verified.</div></>;
      break;
  }

  return (
    <Dialog title={title} onClose={onClose} footer={<>
      <button className="btn subtle" onClick={onClose} disabled={busy}>Cancel</button>
      <button className="btn primary" onClick={run} disabled={busy || !canRun}>{busy ? 'Working…' : confirm}</button>
    </>}>
      {body}
    </Dialog>
  );
}
