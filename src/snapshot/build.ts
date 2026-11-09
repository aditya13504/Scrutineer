import type { TraceSnapshot } from '../engine/types';
import { searchProjectIssues } from '../jira/client';
import { executionsFromIssues, getSettings, suspectsFromIssues } from '../store/state';
import { assembleSnapshot } from './assemble';

export async function buildSnapshot(projectKey: string, release: string): Promise<TraceSnapshot> {
  // One search returns the issues, their links and the execution/suspect properties on each test case.
  const [settings, issues] = await Promise.all([getSettings(), searchProjectIssues(projectKey)]);
  return assembleSnapshot({
    projectKey, release, profileId: settings.profileId, takenAt: new Date().toISOString(),
    issues, roleFallback: settings.roleFallback, executions: executionsFromIssues(issues), suspects: suspectsFromIssues(issues),
  });
}
