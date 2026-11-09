// jira:workflowValidator — blocks closing a "release-gate" issue while its release is NO-GO.
import { evaluateGate } from '../engine/gate';
import { getIssue } from '../jira/client';
import { buildSnapshot } from '../snapshot/build';

export const RELEASE_GATE_LABEL = 'release-gate';

export async function validateRelease(args: { issue: { key: string } }): Promise<{ result: boolean; errorMessage?: string }> {
  try {
    const issue = await getIssue(args.issue.key);
    if (!(issue.fields.labels ?? []).includes(RELEASE_GATE_LABEL)) return { result: true };
    const release = issue.fields.fixVersions?.[0]?.name;
    if (!release) return { result: true };
    const gate = evaluateGate(await buildSnapshot(args.issue.key.split('-')[0], release));
    if (gate.verdict !== 'NO_GO') return { result: true };
    const n = gate.findings.filter((f) => f.severity === 'blocking').length;
    return { result: false, errorMessage: `Scrutineer: ${release} is NO-GO — ${n} blocking finding(s). Open the Scrutineer Control Room.` };
  } catch (e) {
    console.error('release validator failed', e);
    return { result: false, errorMessage: 'Scrutineer could not evaluate the release gate. Try again or check the app logs.' };
  }
}
