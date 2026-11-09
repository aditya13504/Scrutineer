import type { Execution, Role, SuspectFlag, TraceItem, TraceSnapshot } from '../engine/types';
import { mapIssue, mapLinks, type JiraIssue } from '../jira/map';

export interface AssembleInput {
  projectKey: string;
  release: string;
  profileId: string;
  takenAt: string;
  issues: JiraIssue[];
  roleFallback: Record<string, Role>;
  executions: Record<string, Execution[]>;
  suspects: Record<string, SuspectFlag[]>;
}

export function assembleSnapshot(i: AssembleInput): TraceSnapshot {
  const items: Record<string, TraceItem> = {};
  for (const raw of i.issues) {
    const it = mapIssue(raw, i.roleFallback);
    if (it) items[it.key] = it;
  }
  const isTest = (k: string) => items[k]?.role === 'TC';
  const executions: Record<string, Execution[]> = {};
  for (const [k, v] of Object.entries(i.executions)) if (isTest(k) && v?.length) executions[k] = v;
  const suspects = Object.entries(i.suspects).filter(([k]) => isTest(k)).flatMap(([, v]) => v ?? []);
  const links = mapLinks(i.issues).filter((l) => items[l.from] && items[l.to]);
  return { projectKey: i.projectKey, release: i.release, profileId: i.profileId, takenAt: i.takenAt, items, links, executions, suspects };
}
