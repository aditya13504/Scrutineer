import { evaluateGate } from '../engine/gate';
import { ensureSpace, createPage, pageUrl } from '../confluence/client';
import { getServerInfo } from '../jira/client';
import { buildSnapshot } from '../snapshot/build';
import { addEvidence, getSignoffs, putStoredSnapshot, type EvidenceRecord } from '../store/kvs';
import { hashSnapshot, renderEvidencePack } from './render';

export async function publishEvidencePack(projectKey: string, release: string, spaceKey: string, actorName: string): Promise<EvidenceRecord> {
  const snap = await buildSnapshot(projectKey, release);
  const gate = evaluateGate(snap);
  const hash = hashSnapshot(snap, gate);
  const generatedAt = new Date().toISOString();
  const snapshotId = `${projectKey}:${release}:${generatedAt}`;
  await putStoredSnapshot(projectKey, release, { snap, gate, hash, at: generatedAt });
  const signoffs = await getSignoffs(projectKey, release);
  const { title, storage } = renderEvidencePack(snap, gate, { generatedBy: actorName, signoffs, hash, snapshotId, generatedAt });
  const space = await ensureSpace(spaceKey, `${projectKey} Functional Safety`, 'Scrutineer evidence packs.');
  const page = await createPage(space.id, title, storage);
  const url = pageUrl((await getServerInfo()).baseUrl, page);
  const rec: EvidenceRecord = { url, title, hash, verdict: gate.verdict, at: generatedAt, by: actorName, release };
  await addEvidence(projectKey, release, rec);
  return rec;
}
