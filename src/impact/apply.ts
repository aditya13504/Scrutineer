import { badge } from '../engine/types';
import { addComment } from '../jira/client';
import { buildSnapshot } from '../snapshot/build';
import { getSuspects, putSuspects } from '../store/state';
import { flagsForChange, mergeFlags, resolveByReview } from './impact';

/** Flags downstream tests as suspect after an upstream change and comments on each newly flagged test. */
export async function applyChangeImpact(projectKey: string, changedKey: string, actorName: string, at: string, fields: string[]): Promise<string[]> {
  const snap = await buildSnapshot(projectKey, '');
  const flags = flagsForChange(snap, changedKey, actorName, at, fields);
  const flagged: string[] = [];
  for (const f of flags) {
    const { flags: merged, added } = mergeFlags(await getSuspects(f.testKey), [f]);
    await putSuspects(f.testKey, merged);
    if (added) {
      flagged.push(f.testKey);
      const up = snap.items[changedKey];
      await addComment(f.testKey,
        `⚠ Suspect: upstream ${badge(up)} changed on ${at.slice(0, 10)} by ${actorName}. ` +
        `Re-run this test or record an impact review in Scrutineer.`);
    }
  }
  return flagged;
}

export async function reviewSuspect(testKey: string, upstreamKey: string | undefined, actorName: string, justification: string): Promise<void> {
  const flags = await getSuspects(testKey);
  await putSuspects(testKey, resolveByReview(flags, upstreamKey, actorName, justification, new Date().toISOString()));
}
