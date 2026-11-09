// Pure rendering of the Confluence evidence pack (storage format) and the tamper-evidence hash.
import { createHash } from 'node:crypto';
import { buildContext } from '../engine/context';
import { type Execution, type GateResult, type TraceSnapshot } from '../engine/types';
import type { Signoff } from '../store/kvs';

export const DISCLAIMER = 'Scrutineer supports evidence gathering. It does not certify compliance.';

export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as object).sort().filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

export function hashSnapshot(snap: TraceSnapshot, gate: GateResult): string {
  const { takenAt: _ignored, ...rest } = snap;
  return createHash('sha256').update(canonicalJson({ snap: rest, gate })).digest('hex');
}

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function sourceLabel(e: Execution): string {
  if (e.source === 'bench-sim') return 'simulated HIL bench';
  if (e.source === 'manual') return `manual attestation by ${e.actor}`;
  return `${e.actor}${e.reference ? ` — ${e.reference}` : ''}`;
}

// HTML for the matrix: a CI run URL becomes a short link so long URLs don't stretch the table.
export function sourceHtml(e: Execution): string {
  if (e.source === 'ci' && e.reference && /^https?:\/\/\S+$/i.test(e.reference)) {
    return `${esc(e.actor)}, <a href="${esc(e.reference)}">run log</a>`;
  }
  return esc(sourceLabel(e));
}

const VERDICT_TEXT = { GO: 'GO', AT_RISK: 'AT RISK', NO_GO: 'NO-GO' } as const;
const VERDICT_PANEL = { GO: 'tip', AT_RISK: 'note', NO_GO: 'warning' } as const;
const VERDICT_COLOUR = { GO: 'Green', AT_RISK: 'Yellow', NO_GO: 'Red' } as const;

export interface EvidenceContext { generatedBy: string; signoffs: Signoff[]; hash: string; snapshotId: string; generatedAt: string }

export function renderEvidencePack(snap: TraceSnapshot, gate: GateResult, ctx: EvidenceContext): { title: string; storage: string } {
  const c = buildContext(snap);
  const when = ctx.generatedAt.replace('T', ' ').slice(0, 16) + ' UTC';
  const title = `Scrutineer Evidence Pack — ${snap.release} — ${when}`;
  const it = (k: string) => snap.items[k];
  const label = (k: string) => (it(k) ? `${it(k).role} <strong>${esc(k)}</strong>` : esc(k));
  const v = gate.verdict;

  const rows = c.scopeReqs.map((r) => {
    const hz = c.outgoing(r.key, 'mitigates').filter((k) => it(k)?.role === 'HAZ');
    const impl = c.incoming(r.key, 'implements').filter((k) => it(k)?.role === 'IMP');
    const tests = c.incoming(r.key, 'verifies').filter((k) => it(k)?.role === 'TC');
    const results = tests.map((t) => {
      const e = c.latestExec(t, snap.release);
      return e ? `${label(t)}: ${e.result} (${sourceHtml(e)},${e.executedAt.slice(0, 10)})` : `${label(t)}: not run on ${esc(snap.release)}`;
    });
    return `<tr><td>${label(r.key)}<br/>${esc(r.summary)}</td><td>${r.asil ?? '—'}</td>` +
      `<td>${hz.map(label).join('<br/>') || '—'}</td>` +
      `<td>${impl.map((k) => `${label(k)} (${esc(it(k).status)})`).join('<br/>') || '—'}</td>` +
      `<td>${results.join('<br/>') || '—'}</td></tr>`;
  }).join('');

  const findings = gate.findings.length
    ? `<table><tbody><tr><th>Rule</th><th>Severity</th><th>Finding</th></tr>${gate.findings.map((f) =>
      `<tr><td>${f.ruleId}</td><td>${f.severity}</td><td>${esc(f.message)}</td></tr>`).join('')}</tbody></table>`
    : '<p>No findings. Every rule in the profile passed.</p>';

  const scopeTests = new Set(c.scopeTests.map((t) => t.key));
  const suspects = snap.suspects.filter((s) => scopeTests.has(s.testKey));
  const suspectHtml = suspects.length
    ? `<table><tbody><tr><th>Test</th><th>Upstream change</th><th>Resolution</th></tr>${suspects.map((s) => {
      const res = s.resolved
        ? `${s.resolved.by === 'review' ? 'Impact review' : 'Re-run'} by ${esc(s.resolved.actor)} on ${s.resolved.at.slice(0, 10)}${s.resolved.justification ? `: “${esc(s.resolved.justification)}”` : ''}`
        : ((snap.executions[s.testKey] ?? []).some((e) => e.version === snap.release && e.executedAt > s.changedAt) ? 'Re-run after change' : '<strong>Open</strong>');
      return `<tr><td>${label(s.testKey)}</td><td>${esc(s.reason)} — ${esc(s.changedBy)}, ${s.changedAt.slice(0, 10)}</td><td>${res}</td></tr>`;
    }).join('')}</tbody></table>`
    : '<p>No suspect links recorded for this release.</p>';

  const roles = ['Safety Manager', 'Test Lead', 'Release Manager'] as const;
  const signoffRows = roles.map((role) => {
    const s = ctx.signoffs.find((x) => x.role === role && x.hash === ctx.hash);
    return `<tr><td>${role}</td><td>${s ? esc(s.name) : ''}</td><td>${s ? s.at.replace('T', ' ').slice(0, 16) + ' UTC' : ''}</td></tr>`;
  }).join('');

  const st = gate.stats;
  const storage = [
    `<ac:structured-macro ac:name="${VERDICT_PANEL[v]}"><ac:rich-text-body><p><ac:structured-macro ac:name="status"><ac:parameter ac:name="colour">${VERDICT_COLOUR[v]}</ac:parameter><ac:parameter ac:name="title">${VERDICT_TEXT[v]}</ac:parameter></ac:structured-macro> ` +
      `<strong>Release ${esc(snap.release)} is ${VERDICT_TEXT[v]}</strong> — readiness ${gate.score}/100, ${gate.findings.filter((f) => f.severity === 'blocking').length} blocking finding(s).</p></ac:rich-text-body></ac:structured-macro>`,
    `<h2>Scope and profile</h2><p>Project <strong>${esc(snap.projectKey)}</strong>, release <strong>${esc(snap.release)}</strong>, profile ISO 26262. ` +
      `${st.requirements} safety requirements, ${st.hazards} ASIL-rated hazards, ${st.tests} verifying test cases. Generated by ${esc(ctx.generatedBy)} at ${when}.</p>`,
    `<h2>Traceability matrix</h2><table><tbody><tr><th>Safety requirement</th><th>ASIL</th><th>Hazards mitigated</th><th>Implementation</th><th>Verification (latest result on ${esc(snap.release)})</th></tr>${rows}</tbody></table>`,
    `<h2>Findings</h2>${findings}`,
    `<h2>Suspect-link history (change impact)</h2>${suspectHtml}`,
    `<h2>Sign-off</h2><table><tbody><tr><th>Role</th><th>Name</th><th>Signed</th></tr>${signoffRows}</tbody></table>`,
    `<h2>Integrity</h2><p>SHA-256 of the evaluated snapshot: <code>${esc(ctx.hash)}</code><br/>Snapshot id: <code>${esc(ctx.snapshotId)}</code>. ` +
      `Scrutineer stores this snapshot. Re-computing the hash verifies that this page matches the evidence it was generated from.</p>`,
    `<p><em>${DISCLAIMER}</em></p>`,
  ].join('\n');
  return { title, storage };
}
