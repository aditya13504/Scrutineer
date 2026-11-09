// Forge trigger: avi:jira:updated:issue → change-impact suspect flagging.
import { applyChangeImpact } from '../impact/apply';
import { TRACE_FIELDS } from '../impact/impact';
import { getIssue, getUser } from '../jira/client';
import { mapIssue } from '../jira/map';
import { getSettings } from '../store/state';

interface IssueUpdatedEvent {
  selfGenerated?: boolean;
  atlassianId?: string;
  timestamp?: string | number;
  issue: { key: string; fields?: { project?: { key: string } } };
  changelog?: { items?: { field?: string; fieldId?: string }[] };
}

const UPSTREAM_ROLES = ['HAZ', 'REQ', 'DEC'];

export async function onIssueUpdated(event: IssueUpdatedEvent): Promise<void> {
  if (event.selfGenerated) return;
  const fields = (event.changelog?.items ?? []).map((i) => (i.fieldId ?? i.field ?? '').toLowerCase());
  if (!fields.some((f) => TRACE_FIELDS.includes(f))) return;
  // Cheap check first: only hazards, requirements and decisions have downstream verification.
  const item = mapIssue(await getIssue(event.issue.key), (await getSettings()).roleFallback);
  if (!item || !UPSTREAM_ROLES.includes(item.role)) return;
  const projectKey = event.issue.fields?.project?.key ?? event.issue.key.split('-')[0];
  let actor = 'someone';
  if (event.atlassianId) {
    try { actor = (await getUser(event.atlassianId)).displayName; } catch { /* keep default */ }
  }
  const at = eventTime(event.timestamp);
  const flagged = await applyChangeImpact(projectKey, event.issue.key, actor, at, fields);
  console.log(`Scrutineer change-impact: ${event.issue.key} changed (${fields.join(',')}); flagged ${flagged.length} test(s)`, flagged);
}

// Jira sends the event time as epoch milliseconds, sometimes as a string ("1762687526188").
// Never let an odd timestamp drop a change-impact event: fall back to now.
export function eventTime(ts: string | number | undefined, now = new Date()): string {
  if (ts === undefined || ts === '') return now.toISOString();
  const n = typeof ts === 'number' ? ts : /^\d+$/.test(ts) ? Number(ts) : Date.parse(ts);
  const d = new Date(n);
  return Number.isNaN(d.getTime()) ? now.toISOString() : d.toISOString();
}
