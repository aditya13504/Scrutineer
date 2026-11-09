import { evaluateGate } from './engine/gate';
import { hashSnapshot } from './evidence/render';
import { buildSnapshot } from './snapshot/build';
import { getSignoffs, putSignoffs, type Signoff } from './store/state';

export const SIGNOFF_ROLES: Signoff['role'][] = ['Safety Manager', 'Test Lead', 'Release Manager'];

export async function signOff(projectKey: string, release: string, role: Signoff['role'], accountId: string, name: string): Promise<Signoff[]> {
  if (!SIGNOFF_ROLES.includes(role)) throw new Error(`Unknown sign-off role ${role}.`);
  const snap = await buildSnapshot(projectKey, release);
  const gate = evaluateGate(snap);
  if (gate.verdict !== 'GO') throw new Error(`Only a GO release can be signed off. ${release} is ${gate.verdict.replace('_', '-')}.`);
  const entry: Signoff = { role, accountId, name, at: new Date().toISOString(), hash: hashSnapshot(snap, gate) };
  const list = [...(await getSignoffs(projectKey, release)).filter((s) => s.role !== role), entry];
  await putSignoffs(projectKey, release, list);
  return list;
}
