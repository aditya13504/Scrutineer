import type { TraceSnapshot } from '../engine/types';
import { searchProjectIssues } from '../jira/client';
import { getSettings, projectExecutions, projectSuspects } from '../store/kvs';
import { assembleSnapshot } from './assemble';

export async function buildSnapshot(projectKey: string, release: string): Promise<TraceSnapshot> {
  const [settings, issues, executions, suspects] = await Promise.all([
    getSettings(), searchProjectIssues(projectKey), projectExecutions(projectKey), projectSuspects(projectKey),
  ]);
  return assembleSnapshot({
    projectKey, release, profileId: settings.profileId, takenAt: new Date().toISOString(),
    issues, roleFallback: settings.roleFallback, executions, suspects,
  });
}
