// "Brake-by-Wire ECU" demo safety program. Pure data, engineered so BBW 2.3 fails exactly four checks.
import type { Asil, Execution, LinkRole, Role, StatusCategory, TraceItem, TraceSnapshot } from '../engine/types';

export interface DemoIssue {
  ref: string;
  role: Role;
  summary: string;
  description: string;
  asil?: Asil;
  fixVersions: string[];
  status: StatusCategory;
  superseded?: boolean;
  severity?: string;
  /** 'demo:<name>' synthetic reviewer, or '$ASSIGNEE' to plant a self-review. */
  reviewer?: string;
  /** IMP items are assigned to the person loading the demo. */
  assignToLoader?: boolean;
}
export interface DemoExecution { ref: string; exec: Execution }
export interface DemoSuspect { testRef: string; upstreamRef: string; changedAt: string; changedBy: string; reason: string }
export interface DemoPage { title: string; body: string; linkTo: string[] }

export const DEMO_REVIEWERS: Record<string, string> = {
  'demo:priya': 'Priya Raman (Safety Assessor)',
  'demo:jonas': 'Jonas Weber (Senior SW Engineer)',
  'demo:mei': 'Mei Tanaka (Verification Lead)',
};

const V22 = 'BBW 2.2';
const V23 = 'BBW 2.3';
const both = [V22, V23];

const H = (ref: string, asil: Asil, summary: string, description: string, fixVersions = [V23]): DemoIssue =>
  ({ ref, role: 'HAZ', asil, summary, description, fixVersions, status: 'done' });
const R = (ref: string, asil: Asil, summary: string, description: string, fixVersions = [V23], extra: Partial<DemoIssue> = {}): DemoIssue =>
  ({ ref, role: 'REQ', asil, summary, description, fixVersions, status: 'done', ...extra });
const I = (ref: string, summary: string, fixVersions = [V23], reviewer = 'demo:jonas'): DemoIssue =>
  ({ ref, role: 'IMP', summary, description: `Implementation work item for the linked safety requirement. Peer review is recorded in Scrutineer.`, fixVersions, status: 'done', reviewer, assignToLoader: true });
const T = (ref: string, summary: string, description: string, fixVersions = [V23]): DemoIssue =>
  ({ ref, role: 'TC', summary, description, fixVersions, status: 'done' });

const issues: DemoIssue[] = [
  // Hazards (HARA)
  H('H1', 'D', 'Loss of braking deceleration on driver demand', 'Vehicle fails to decelerate when the driver presses the brake pedal. S3/E4/C3.', both),
  H('H2', 'D', 'Unintended braking at speed', 'Brake system applies significant deceleration without driver demand, risking rear-end collision. S3/E4/C3.', both),
  H('H3', 'C', 'Asymmetric braking causing vehicle yaw', 'Unequal left/right brake force pulls the vehicle out of lane. S3/E3/C3.', both),
  H('H4', 'B', 'Delayed brake response beyond driver expectation', 'Deceleration onset is later than the driver expects, lengthening stopping distance. S2/E4/C2.'),
  H('H5', 'A', 'Brake lamps not illuminated during braking', 'Following traffic is not warned of deceleration. S2/E4/C1.'),
  H('H6', 'QM', 'Brake warning chime volume too low', 'Driver may not hear the service warning chime. Quality issue, no safety goal.'),

  // Safety decisions
  { ref: 'D1', role: 'DEC', summary: 'ASIL D braking functions use 2oo2 redundant wheel-speed sensing', description: 'Decided at the safety concept review: every ASIL D function consuming wheel speed uses two independent sensors with a cross-check.', fixVersions: [V23], status: 'done' },
  { ref: 'D2', role: 'DEC', summary: 'Fail-operational: degrade to secondary actuator path within 50 ms', description: 'On a single actuator path failure the ECU switches to the secondary path within 50 ms and warns the driver.', fixVersions: [V23], status: 'done' },

  // BBW 2.2 (shipped, all green)
  R('S1', 'D', 'Pedal travel sensor range check', 'Detect pedal travel signals outside 0.25–4.75 V within 10 ms and enter safe state.', [V22]),
  R('S2', 'D', 'Brake ECU watchdog supervision', 'External window watchdog supervises the main core; a missed window triggers a reset within 5 ms.', [V22]),
  R('S3', 'C', 'Hydraulic pressure sensor range check', 'Detect out-of-range hydraulic pressure readings and limit brake force to the last valid value.', [V22]),
  R('S4', 'A', 'Brake lamp driver activation on brake request', 'Activate brake lamp output on any brake request above 0.5 m/s² deceleration.', [V22]),
  R('S5', 'D', 'Brake pedal released detection', 'Detect pedal release and remove the brake command within 30 ms to prevent unintended braking.', [V22]),
  R('S6', 'C', 'Wheel-speed signal range check', 'Reject wheel-speed values above 300 km/h or with jumps above 40 km/h per 10 ms.', [V22]),
  I('IS1', 'Implement pedal travel range check', [V22]), I('IS2', 'Integrate window watchdog driver', [V22]),
  I('IS3', 'Implement hydraulic pressure range check', [V22]), I('IS4', 'Implement brake lamp activation', [V22]),
  I('IS5', 'Implement pedal release detection', [V22]), I('IS6', 'Implement wheel-speed range check', [V22]),
  T('TS1', 'Verify pedal travel out-of-range triggers safe state', 'Inject 0.1 V and 4.9 V on both channels; expect safe state within 10 ms.', [V22]),
  T('TS2', 'Verify watchdog reset on missed window', 'Suppress watchdog service; expect reset within 5 ms.', [V22]),
  T('TS3', 'Verify pressure sensor fault limits brake force', 'Inject out-of-range pressure; expect brake force held at last valid value.', [V22]),
  T('TS4', 'Verify brake lamp activates on brake request', 'Request 1 m/s² deceleration; expect lamp output on.', [V22]),
  T('TS5', 'Verify brake command removed on pedal release', 'Release pedal; expect zero brake command within 30 ms.', [V22]),
  T('TS6', 'Verify wheel-speed plausibility rejects jumps', 'Inject a 60 km/h step within 10 ms; expect value rejected.', [V22]),

  // BBW 2.3 safety requirements
  R('R1', 'D', 'Brake pedal position sensor plausibility check', 'Compare both pedal position channels; a deviation above 5 % for more than 20 ms is a plausibility fault and requests safe state.'),
  R('R2', 'D', 'Dual-channel pedal sensor acquisition with independent Hall sensors', 'Acquire pedal position from two independent Hall-effect sensors on separate supplies, sampled at 1 kHz.'),
  R('R3', 'D', 'Brake command timeout handling', 'If no valid brake command is received within 20 ms, transition to the safe state and apply the secondary path.'),
  R('R4', 'D', 'Wheel-speed sensor redundancy cross-check', 'Cross-check redundant wheel-speed sensors per wheel; a deviation above 3 km/h for 50 ms flags a sensor fault.'),
  R('R5', 'D', 'Redundant brake actuator command path', 'Provide a second independent command path to the brake actuators, switched within 50 ms on primary path failure.'),
  R('R6', 'D', 'Unintended brake request detection', 'Compare the actuator torque request against driver and ADAS demand; unexplained requests above 0.3 g are suppressed.'),
  R('R7', 'C', 'Brake force distribution limit per axle', 'Limit front/rear brake force distribution to the calibrated envelope to keep the vehicle stable.'),
  R('R8', 'C', 'Yaw-rate monitored brake balancing', 'Balance left/right brake force when yaw rate deviates more than 2 °/s from the steering-derived target.'),
  R('R9', 'B', 'End-to-end brake latency ≤ 150 ms', 'Deceleration onset within 150 ms of pedal application under nominal conditions.'),
  R('R10', 'C', 'CAN brake message end-to-end protection', 'Protect brake command CAN frames with CRC and alive counter (AUTOSAR E2E profile 2).'),
  R('R11', 'A', 'Brake lamp activation within 100 ms', 'Illuminate brake lamps within 100 ms of any deceleration request above 0.5 m/s².'),
  R('R12', 'A', 'Brake lamp output short-circuit diagnosis', 'Detect short-to-ground and open load on brake lamp outputs and set a DTC.'),
  R('R13', 'B', 'Safe-state entry logging to non-volatile memory', 'Record cause, timestamp and vehicle speed for every safe-state entry in NVM.'),
  R('R14', 'B', 'Degraded-mode driver warning within 200 ms', 'Show the degraded-braking warning within 200 ms of entering a degraded mode.'),
  R('R15', 'D', 'Single-channel pedal sensor acquisition (superseded)', 'Superseded by the dual-channel acquisition requirement after the safety concept review.', [V23], { superseded: true }),

  // BBW 2.3 implementation
  I('I1', 'Implement pedal plausibility monitor'), I('I2', 'Integrate dual Hall pedal sensors'),
  I('I3', 'Implement brake command timeout state machine'), I('I4', 'Implement wheel-speed cross-check'),
  I('I5', 'Implement redundant brake actuator command path', [V23], '$ASSIGNEE'),
  I('I6', 'Implement unintended brake request monitor'), I('I7', 'Implement axle brake force limiter'),
  I('I8', 'Implement yaw-rate brake balancing'), I('I9', 'Optimise brake signal chain latency'),
  I('I10', 'Add E2E protection to brake CAN frames'), I('I11', 'Implement brake lamp fast activation'),
  I('I12', 'Implement brake lamp output diagnostics'), I('I13', 'Implement safe-state NVM logger'),
  I('I14', 'Implement degraded-mode warning'),

  // BBW 2.3 verification
  T('T2', 'Verify dual pedal channels are independently acquired', 'Disconnect channel A supply; channel B continues at 1 kHz.'),
  T('T3', 'Verify safe state after 20 ms command timeout', 'Stop brake command frames; expect safe state and secondary path within 20 ms.'),
  T('T4', 'Verify wheel-speed cross-check detects sensor deviation', 'Offset one sensor by 5 km/h for 60 ms; expect sensor fault flagged.'),
  T('T5', 'Verify switch to secondary actuator path within 50 ms', 'Inject primary path open-circuit; expect secondary path active within 50 ms.'),
  T('T6', 'Verify unexplained brake request is suppressed', 'Inject 0.4 g actuator request with zero demand; expect suppression.'),
  T('T6B', 'Fault injection: torque monitor under CAN bus-off', 'Force CAN bus-off during an unexplained request; expect suppression and DTC.'),
  T('T7', 'Verify axle force distribution stays within envelope', 'Sweep demand 0–1 g; distribution stays within calibration envelope.'),
  T('T8', 'Verify yaw-rate balancing on split-mu surface', 'HIL split-mu scenario at 80 km/h; yaw deviation stays below 2 °/s.'),
  T('T9', 'Verify pedal-to-deceleration latency ≤ 150 ms', 'Measure 200 pedal applications; 99.9th percentile below 150 ms.'),
  T('T10', 'Verify E2E protection rejects corrupted frames', 'Corrupt CRC and repeat alive counter; frames rejected and fault counted.'),
  T('T11', 'Verify brake lamps on within 100 ms', 'Request 0.6 m/s²; lamp current detected within 100 ms.'),
  T('T12', 'Verify brake lamp short-circuit DTC', 'Short output to ground; DTC set within 500 ms.'),
  T('T13', 'Verify safe-state entry is logged to NVM', 'Trigger safe state; NVM record contains cause, time and speed.'),
  T('T14', 'Verify degraded warning shown within 200 ms', 'Force degraded mode; cluster warning within 200 ms.'),
  T('TDECOY', 'Verify pedal plausibility inputs are sampled at 1 kHz', 'Checks acquisition rate of both pedal channels (supports the dual-channel acquisition requirement).'),

  // Defect
  { ref: 'X1', role: 'DEF', summary: 'Intermittent CAN timeout on brake ECU at −30 °C', description: 'Climate chamber run 2026-11-04: brake command frames delayed up to 26 ms at −30 °C, exceeding the 20 ms timeout.', fixVersions: [V23], status: 'new', severity: 'Major' },
];

const links: { role: LinkRole; from: string; to: string }[] = [
  // 2.2
  ['S1', 'H1'], ['S2', 'H1'], ['S2', 'H2'], ['S3', 'H3'], ['S4', 'H5'], ['S5', 'H2'], ['S6', 'H3'],
].map(([from, to]) => ({ role: 'mitigates' as const, from, to }));
for (let n = 1; n <= 6; n++) links.push({ role: 'implements', from: `IS${n}`, to: `S${n}` }, { role: 'verifies', from: `TS${n}`, to: `S${n}` });
// 2.3 mitigations
for (const [from, to] of [['R1', 'H1'], ['R1', 'H2'], ['R2', 'H1'], ['R3', 'H1'], ['R4', 'H1'], ['R4', 'H3'], ['R5', 'H1'], ['R6', 'H2'],
  ['R7', 'H3'], ['R8', 'H3'], ['R9', 'H4'], ['R10', 'H2'], ['R11', 'H5'], ['R12', 'H5'], ['R14', 'H4'], ['R15', 'H1']]) links.push({ role: 'mitigates', from, to });
links.push({ role: 'derivedFrom', from: 'R4', to: 'D1' }, { role: 'derivedFrom', from: 'R5', to: 'D2' }, { role: 'derivedFrom', from: 'R13', to: 'D2' });
for (let n = 1; n <= 14; n++) links.push({ role: 'implements', from: `I${n}`, to: `R${n}` });
for (const n of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]) links.push({ role: 'verifies', from: `T${n}`, to: `R${n}` });
links.push({ role: 'verifies', from: 'T6B', to: 'R6' }, { role: 'verifies', from: 'TDECOY', to: 'R2' }, { role: 'blocks', from: 'X1', to: 'R3' });

const CI = (n: number) => `CI (HIL pipeline #${n})`;
const executions: DemoExecution[] = [
  ...[1, 2, 3, 4, 5, 6].map((n) => ({ ref: `TS${n}`, exec: { result: 'Passed' as const, version: V22, executedAt: `2026-10-0${n}T09:00:00.000Z`, source: 'ci' as const, actor: CI(1102), reference: 'https://ci.example.com/hil/1102' } })),
  ...['T2', 'T3', 'T4', 'T5', 'T6', 'T6B', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12', 'T13', 'T14', 'TDECOY'].map((ref, i) => ({
    ref, exec: { result: 'Passed' as const, version: V23, executedAt: `2026-11-0${3 + (i % 3)}T1${i % 10}:00:00.000Z`, source: 'ci' as const, actor: CI(1180), reference: 'https://ci.example.com/hil/1180' },
  })),
  // T5 failed once on 2.3 before passing, which shows history
  { ref: 'T5', exec: { result: 'Failed', version: V23, executedAt: '2026-11-02T08:00:00.000Z', source: 'ci', actor: CI(1171), reference: 'https://ci.example.com/hil/1171' } },
];

const suspects: DemoSuspect[] = [{
  testRef: 'T4', upstreamRef: 'R4', changedAt: '2026-11-06T14:20:00.000Z', changedBy: 'Marta Kowalski',
  reason: 'upstream REQ R4 changed (description)',
}];

const pages: DemoPage[] = [
  { title: 'BBW — Item Definition', linkTo: [], body: '<p>The Brake-by-Wire ECU replaces the hydraulic pedal linkage with redundant electronic command paths for a mid-size passenger car.</p><ul><li>Inputs: dual Hall pedal sensors, four redundant wheel-speed sensor pairs, yaw-rate sensor</li><li>Outputs: two independent actuator command paths, brake lamps, driver warnings</li></ul>' },
  { title: 'BBW — Hazard Analysis and Risk Assessment (HARA)', linkTo: ['H1', 'H2', 'H3', 'H4', 'H5'], body: '<p>Hazards rated with severity (S), exposure (E) and controllability (C) per ISO 26262-3. ASIL D: loss of braking, unintended braking. ASIL C: asymmetric braking. ASIL B: delayed response. ASIL A: brake lamps.</p>' },
  { title: 'BBW 2.3 — Technical Safety Concept', linkTo: ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'], body: '<p>Release 2.3 introduces the redundant actuator path (fail-operational per decision D2) and 2oo2 wheel-speed sensing (decision D1).</p>' },
  { title: 'BBW 2.3 — Software Safety Requirements Specification', linkTo: ['R7', 'R8', 'R9', 'R10', 'R11', 'R12', 'R13', 'R14'], body: '<p>Software safety requirements for release 2.3, traced in Jira and verified on the HIL bench. The live traceability status is in the Scrutineer Control Room.</p>' },
];

export const DEMO = {
  project: { key: 'BBW', name: 'Brake-by-Wire ECU' },
  versions: [V22, V23],
  releasedVersions: [V22],
  issues, links, executions, suspects, pages,
};

/** Refs the engine must never flag. */
export const DEMO_DECOYS = ['TDECOY', 'R15'];
/** The four planted problems, used by the video script and tests. */
export const DEMO_FIX_TARGETS = { missingTestReq: 'R1', suspectTest: 'T4', suspectUpstream: 'R4', defect: 'X1', selfReviewedImpl: 'I5' };

/** The dataset as a snapshot with refs as keys, for offline engine tests. */
export function demoAsSnapshot(release: string): TraceSnapshot {
  const items: Record<string, TraceItem> = {};
  for (const d of issues) {
    const it: TraceItem = {
      key: d.ref, role: d.role, summary: d.summary, status: d.status === 'done' ? 'Done' : 'To Do', statusCategory: d.status,
      fixVersions: d.fixVersions, updatedAt: '2026-11-01T00:00:00.000Z',
    };
    if (d.asil) it.asil = d.asil;
    if (d.superseded) it.superseded = true;
    if (d.severity) it.severity = d.severity;
    if (d.assignToLoader) it.assigneeId = 'loader';
    if (d.reviewer) it.reviewerId = d.reviewer === '$ASSIGNEE' ? 'loader' : d.reviewer;
    items[d.ref] = it;
  }
  const execs: Record<string, Execution[]> = {};
  for (const e of executions) execs[e.ref] = [...(execs[e.ref] ?? []), e.exec];
  return {
    projectKey: 'BBW', release, profileId: 'iso26262', takenAt: '2026-11-09T00:00:00.000Z', items,
    links: links.map((l) => ({ ...l })), executions: execs,
    suspects: suspects.map((s) => ({ testKey: s.testRef, upstreamKey: s.upstreamRef, changedAt: s.changedAt, changedBy: s.changedBy, reason: s.reason })),
  };
}
