import type { DemoStatus } from '../store/state';

export const STALE_RUN_MS = 16 * 60 * 1000; // consumer timeout is 15 min

/** Decides what to do when the loader starts, based on a completion marker rather than "any demo issue exists". */
export function existingDataDecision(completed: boolean, existingDemoIssues: number): 'load' | 'exists' | 'incomplete' {
  if (existingDemoIssues === 0) return 'load';
  return completed ? 'exists' : 'incomplete';
}

export function assertCanStart(status: DemoStatus, now: number): void {
  if (status.state === 'running' && now - Date.parse(status.at) < STALE_RUN_MS) {
    throw new Error('A demo job is already running. Wait for it to finish.');
  }
}
