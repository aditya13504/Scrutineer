// Scrutineer domain model. Pure types and constants. No Forge imports.

export type Role = 'HAZ' | 'REQ' | 'IMP' | 'TC' | 'DEF' | 'DEC';
export const ROLES: Role[] = ['HAZ', 'REQ', 'IMP', 'TC', 'DEF', 'DEC'];

export type Asil = 'QM' | 'A' | 'B' | 'C' | 'D';
export const ASIL_RANK: Record<Asil, number> = { QM: 0, A: 1, B: 2, C: 3, D: 4 };

export type LinkRole = 'mitigates' | 'implements' | 'verifies' | 'derivedFrom' | 'blocks';
export type StatusCategory = 'new' | 'indeterminate' | 'done';

export interface TraceItem {
  key: string;
  role: Role;
  summary: string;
  status: string;
  statusCategory: StatusCategory;
  asil?: Asil;
  assigneeId?: string;
  assigneeName?: string;
  reviewerId?: string;
  reviewerName?: string;
  fixVersions: string[];
  updatedAt: string;
  superseded?: boolean;
  decomposed?: boolean;
  severity?: string;
}

/** Directed link read as "from <role> to", e.g. TC verifies REQ, REQ mitigates HAZ. */
export interface TraceLink {
  role: LinkRole;
  from: string;
  to: string;
}

export type ExecResult = 'Passed' | 'Failed' | 'NotRun';
export type ExecSource = 'ci' | 'manual' | 'bench-sim';

export interface Execution {
  result: ExecResult;
  version: string;
  executedAt: string;
  source: ExecSource;
  actor: string;
  reference?: string;
}

export interface SuspectFlag {
  testKey: string;
  upstreamKey: string;
  changedAt: string;
  changedBy: string;
  reason: string;
  resolved?: { by: 'rerun' | 'review'; at: string; actor: string; justification?: string };
}

export interface TraceSnapshot {
  projectKey: string;
  release: string;
  profileId: string;
  takenAt: string;
  items: Record<string, TraceItem>;
  links: TraceLink[];
  executions: Record<string, Execution[]>;
  suspects: SuspectFlag[];
}

export type Severity = 'blocking' | 'major' | 'minor';

export type FixType =
  | 'create_test'
  | 'trace_up'
  | 'complete_implementation'
  | 'run_test'
  | 'resolve_suspect'
  | 'assign_reviewer'
  | 'resolve_defect'
  | 'review_asil'
  | 'create_requirement'
  | 'add_scope';

export interface Finding {
  id: string;
  ruleId: string;
  severity: Severity;
  message: string;
  keys: string[];
  fix: FixType;
  clause?: string;
}

export type Verdict = 'GO' | 'AT_RISK' | 'NO_GO';

export interface GateStats {
  hazards: number;
  hazardsMitigated: number;
  requirements: number;
  requirementsImplemented: number;
  requirementsVerified: number;
  tests: number;
  testsPassing: number;
  suspects: number;
  openBlockers: number;
}

export interface GateResult {
  verdict: Verdict;
  score: number;
  lights: number;
  findings: Finding[];
  stats: GateStats;
  scope: string[];
}

export interface RuleContext {
  snap: TraceSnapshot;
  scopeReqs: TraceItem[];
  scopeHazards: TraceItem[];
  scopeTests: TraceItem[];
  outgoing(key: string, role: LinkRole): string[];
  incoming(key: string, role: LinkRole): string[];
  latestExec(testKey: string, version: string): Execution | undefined;
}

export interface Rule {
  id: string;
  severity: Severity;
  title: string;
  clause: string;
  check(ctx: RuleContext): Finding[];
}

export interface Profile {
  id: string;
  name: string;
  standard: string;
  rules: Rule[];
  roleLabels: Record<Role, string>;
}

/** "REQ BBW-12" style label used everywhere in copy. */
export function badge(item: Pick<TraceItem, 'role' | 'key'>): string {
  return `${item.role} ${item.key}`;
}
