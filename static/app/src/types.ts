// UI-side copies of the backend shapes the resolvers return.
export type Role = 'HAZ' | 'REQ' | 'IMP' | 'TC' | 'DEF' | 'DEC';
export type Asil = 'QM' | 'A' | 'B' | 'C' | 'D';
export type Verdict = 'GO' | 'AT_RISK' | 'NO_GO';
export type LinkRole = 'mitigates' | 'implements' | 'verifies' | 'derivedFrom' | 'blocks';
export type FixType = 'create_test' | 'trace_up' | 'complete_implementation' | 'run_test' | 'resolve_suspect' | 'assign_reviewer' | 'resolve_defect' | 'review_asil' | 'create_requirement' | 'add_scope';
export interface TraceItem { key: string; role: Role; summary: string; status: string; statusCategory: 'new' | 'indeterminate' | 'done'; asil?: Asil; assigneeId?: string; assigneeName?: string; reviewerId?: string; reviewerName?: string; fixVersions: string[]; superseded?: boolean }
export interface TraceLink { role: LinkRole; from: string; to: string }
export interface Execution { result: 'Passed' | 'Failed' | 'NotRun'; version: string; executedAt: string; source: 'ci' | 'manual' | 'bench-sim'; actor: string; reference?: string }
export interface SuspectFlag { testKey: string; upstreamKey: string; changedAt: string; changedBy: string; reason: string; resolved?: { by: 'rerun' | 'review'; at: string; actor: string; justification?: string } }
export interface TraceSnapshot { projectKey: string; release: string; items: Record<string, TraceItem>; links: TraceLink[]; executions: Record<string, Execution[]>; suspects: SuspectFlag[] }
export interface Finding { id: string; ruleId: string; severity: 'blocking' | 'major' | 'minor'; message: string; keys: string[]; fix: FixType }
export interface GateStats { hazards: number; hazardsMitigated: number; requirements: number; requirementsImplemented: number; requirementsVerified: number; tests: number; testsPassing: number; suspects: number; openBlockers: number }
export interface GateResult { verdict: Verdict; score: number; lights: number; findings: Finding[]; stats: GateStats; scope: string[] }
export interface Readiness { projectKey: string; release: string; gate: GateResult; snap: TraceSnapshot; hash: string }
export interface TestDraft { summary: string; preconditions: string[]; steps: string[]; expected: string; asil?: Asil }
export interface EvidenceRecord { url: string; title: string; hash: string; verdict: Verdict; at: string; by: string; release: string }
export interface Signoff { role: 'Safety Manager' | 'Test Lead' | 'Release Manager'; accountId: string; name: string; at: string; hash: string }
export interface DemoStatus { state: 'idle' | 'running' | 'created' | 'exists' | 'partial' | 'failed' | 'reset'; projectKey?: string; steps: { name: string; ok: boolean; detail?: string }[]; at: string }
export interface Brief { key: string; role: Role; label: string; summary: string; status: string; asil?: Asil }
export interface IssueTrace {
  projectKey: string; item: TraceItem | null; isDemo?: boolean;
  links?: { role: LinkRole; direction: 'in' | 'out'; other: Brief }[];
  upstream?: Brief[]; downstream?: Brief[]; executions?: Execution[]; suspects?: SuspectFlag[];
}
