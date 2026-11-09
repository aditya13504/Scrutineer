// Forge trigger: avi:jira:updated:issue → change-impact suspect flagging.
import { applyChangeImpact } from '../impact/apply';
import { TRACE_FIELDS } from '../impact/impact';
import { getUser } from '../jira/client';

interface IssueUpdatedEvent {
  selfGenerated?: boolean;
  atlassianId?: string;
  timestamp?: string | number;
  issue: { key: string; fields?: { project?: { key: string } } };
  changelog?: { items?: { field?: string; fieldId?: string }[] };
}

export async function onIssueUpdated(event: IssueUpdatedEvent): Promise<void> {
  if (event.selfGenerated) return;
  const fields = (event.changelog?.items ?? []).map((i) => (i.fieldId ?? i.field ?? '').toLowerCase());
  if (!fields.some((f) => TRACE_FIELDS.includes(f))) return;
  const projectKey = event.issue.fields?.project?.key ?? event.issue.key.split('-')[0];
  let actor = 'someone';
  if (event.atlassianId) {
    try { actor = (await getUser(event.atlassianId)).displayName; } catch { /* keep default */ }
  }
  const at = event.timestamp ? new Date(event.timestamp).toISOString() : new Date().toISOString();
  const flagged = await applyChangeImpact(projectKey, event.issue.key, actor, at, fields);
  console.log(`Scrutineer change-impact: ${event.issue.key} changed (${fields.join(',')}); flagged ${flagged.length} test(s)`, flagged);
}
