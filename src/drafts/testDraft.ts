// Rule-based test case drafting (no AI). The Rovo agent may refine the wording, but this always works.
import type { Asil, TraceItem } from '../engine/types';

export interface TestDraft { summary: string; preconditions: string[]; steps: string[]; expected: string; asil?: Asil }

const TIMING = /\b(\d+\s?ms|latency|timeout|within|deadline|seconds?)\b/i;

export function draftTestCase(req: TraceItem): TestDraft {
  const subject = req.summary.trim();
  const high = req.asil === 'C' || req.asil === 'D';
  const steps = [
    'Nominal case: drive the inputs named in the requirement across their normal operating range and record the ECU response.',
  ];
  if (TIMING.test(subject)) steps.push('Timing: measure the response latency over at least 200 repetitions and record the 99.9th percentile against the stated limit (ms).');
  steps.push('Boundary values: apply inputs at, just inside and just outside each threshold stated in the requirement.');
  if (high) {
    steps.push('Fault injection: inject a single-point fault on each monitored signal (open, short to ground, stuck-at, out-of-range) and confirm detection and the specified reaction.');
    steps.push('Fault injection: repeat with a latent fault present on the redundant channel to confirm the diagnostic coverage claim.');
  }
  steps.push('Record the result, bench configuration and software version as evidence.');
  return {
    summary: `Verify: ${subject}`.slice(0, 255),
    preconditions: [
      'HIL bench configured with the release candidate software and calibration.',
      'Vehicle model at nominal conditions (dry asphalt, 20 °C) unless the step states otherwise.',
      ...(high ? ['Fault-injection unit connected to the monitored signals.'] : []),
    ],
    steps,
    expected: `The ECU behaves exactly as the requirement states in every step, including the specified reaction and timing; no unexpected DTCs are set.`,
    ...(req.asil ? { asil: req.asil } : {}),
  };
}

export function draftToDescription(d: TestDraft, reqLabel: string): string {
  return [
    `Verifies ${reqLabel}${d.asil ? ` (ASIL ${d.asil})` : ''}.`,
    `Preconditions:\n${d.preconditions.map((p) => `• ${p}`).join('\n')}`,
    `Steps:\n${d.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`,
    `Expected result:\n${d.expected}`,
    'Drafted by Scrutineer and approved by a human before creation.',
  ].join('\n\n');
}
