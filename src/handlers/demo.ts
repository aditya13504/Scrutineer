// Async consumer for the demo loader (long-running: up to 900 s).
import { Queue } from '@forge/events';
import { loadDemo, resetDemo } from '../demo/loader';
import { getDemoStatus, putDemoStatus } from '../store/state';
import { assertCanStart } from '../demo/policy';

export const demoQueue = new Queue({ key: 'demo-queue' });

interface DemoJob { action: 'load' | 'reset'; accountId: string; projectKey?: string }

export async function onDemoJob(event: { body: DemoJob }): Promise<void> {
  const job = event.body;
  try {
    if (job.action === 'reset') await resetDemo();
    else await loadDemo({ accountId: job.accountId, projectKey: job.projectKey });
  } catch (e) {
    await putDemoStatus({ state: 'failed', at: new Date().toISOString(), steps: [{ name: job.action, ok: false, detail: (e as Error).message }] });
  }
}

export async function enqueueDemo(job: DemoJob): Promise<void> {
  assertCanStart(await getDemoStatus(), Date.now());
  await putDemoStatus({ state: 'running', at: new Date().toISOString(), steps: [] });
  await demoQueue.push({ body: job as unknown as Record<string, unknown> });
}
