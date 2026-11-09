# Scrutineer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Scrutineer Forge app: an ISO 26262 traceability release gate inside Jira and Confluence, with a Rovo agent, MCP tools, change-impact tracking, and an evidence pack.

**Architecture:**
- A pure TypeScript rule engine (`src/engine`) evaluates a `TraceSnapshot` built from Jira REST plus Forge KVS data.
- Thin Forge adapters expose that engine through:
  - UI resolvers
  - Rovo actions
  - MCP tools
  - a Jira update trigger
  - a results webtrigger
  - a workflow validator
- One Custom UI React app (`static/app`) renders the Control Room, Issue Panel or Admin view depending on `view.getContext().extension.type`.

**Tech Stack:**
- Forge (runtime `nodejs24.x`, CLI 15), TypeScript
- `@forge/api`, `@forge/resolver`, `@forge/kvs`, `@forge/bridge`
- React 18 + Vite for Custom UI
- Vitest
- Local Node: portable v24.22.1 at `~/.node24/node-v24.22.1-win-x64` (prepend it to PATH for every npm/forge command)

**Spec:** `docs/superpowers/specs/2026-11-09-scrutineer-design.md`

## Global Constraints

- Zero cost: never call the Forge LLMs API. No external egress (`permissions.external` absent). Storage is KVS only.
- Rovo is additive. Every agent write action has a deterministic UI equivalent, and nothing in the engine, trigger, evidence pack or loader depends on Rovo.
- No AI or app write without explicit user confirmation. Rovo write actions use `actionVerb: CREATE|UPDATE` and the agent prompt requires confirmation first. UI writes go through a confirm dialog.
- Issue keys are shown as `ROLE KEY`, e.g. `REQ BBW-12`. Roles: `HAZ REQ IMP TC DEF DEC`.
- Evidence sources: `ci | manual | bench-sim`, always labelled. Manual = "manual attestation by <name>". bench-sim = "simulated HIL bench".
- Never claim certification. The UI footer and evidence pack carry: "Scrutineer supports evidence gathering. It does not certify compliance."
- Agent and MCP `name` max 30 chars. Resource key max 23 chars.
- Demo release names: `BBW 2.2` (all green), `BBW 2.3` (fails exactly R4, R6, R8 blocking + R7 major).

## Review Focus

1. **Release with zero in-scope requirements** (an unknown or empty version name): the gate must return `NO_GO` with a single "No safety requirements in scope" finding. It must not return GO, and it must not crash. Test in Task 2.
2. **Test with executions on other versions only:** a test passed on `BBW 2.2` but never run on `BBW 2.3` must fail R5 for 2.3. Test in Task 2.
3. **Suspect flag followed by a later re-run:** an execution after `changedAt` clears R6 even without a review record. Test in Task 2.
4. **Duplicate or self links and a test verifying several requirements:** no double-counted findings, and finding IDs are stable and unique. Test in Task 2.
5. **Malformed ingestion payload** (unknown test key, bad result string, missing/invalid token): reject with 4xx and record nothing for that bad entry. Valid entries in the same batch are still recorded. Test in Task 5.

---

### Task 1: Repo scaffold + domain types

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `manifest.yml` (skeleton: app id placeholder, runtime `nodejs24.x`), `src/index.ts` (empty exports), `src/engine/types.ts`
- Test: `test/engine/types.test.ts` (compile-only smoke)

**Interfaces (Produces, all from `src/engine/types.ts`):**
```ts
export type Role = 'HAZ'|'REQ'|'IMP'|'TC'|'DEF'|'DEC';
export type Asil = 'QM'|'A'|'B'|'C'|'D';
export type LinkRole = 'mitigates'|'implements'|'verifies'|'derivedFrom'|'blocks';
export type StatusCategory = 'new'|'indeterminate'|'done';
export interface TraceItem { key: string; role: Role; summary: string; status: string; statusCategory: StatusCategory;
  asil?: Asil; assigneeId?: string; assigneeName?: string; reviewerId?: string; reviewerName?: string;
  fixVersions: string[]; updatedAt: string; superseded?: boolean; decomposed?: boolean; severity?: string; }
export interface TraceLink { role: LinkRole; from: string; to: string }   // "from <role> to": TC verifies REQ
export type ExecResult = 'Passed'|'Failed'|'NotRun';
export type ExecSource = 'ci'|'manual'|'bench-sim';
export interface Execution { result: ExecResult; version: string; executedAt: string; source: ExecSource; actor: string; reference?: string }
export interface SuspectFlag { testKey: string; upstreamKey: string; changedAt: string; changedBy: string; reason: string;
  resolved?: { by: 'rerun'|'review'; at: string; actor: string; justification?: string } }
export interface TraceSnapshot { projectKey: string; release: string; profileId: string; takenAt: string;
  items: Record<string, TraceItem>; links: TraceLink[]; executions: Record<string, Execution[]>; suspects: SuspectFlag[] }
export type Severity = 'blocking'|'major'|'minor';
export type FixType = 'create_test'|'trace_up'|'complete_implementation'|'run_test'|'resolve_suspect'|'assign_reviewer'|'resolve_defect'|'review_asil'|'create_requirement'|'add_scope';
export interface Finding { id: string; ruleId: string; severity: Severity; message: string; keys: string[]; fix: FixType; clause?: string }
export type Verdict = 'GO'|'AT_RISK'|'NO_GO';
export interface GateStats { hazards: number; hazardsMitigated: number; requirements: number; requirementsImplemented: number;
  requirementsVerified: number; tests: number; testsPassing: number; suspects: number; openBlockers: number }
export interface GateResult { verdict: Verdict; score: number; lights: number; findings: Finding[]; stats: GateStats; scope: string[] }
export interface Rule { id: string; severity: Severity; title: string; clause: string; check(ctx: RuleContext): Finding[] }
export interface RuleContext { snap: TraceSnapshot; scopeReqs: TraceItem[]; scopeHazards: TraceItem[]; scopeTests: TraceItem[];
  outgoing(key: string, role: LinkRole): string[]; incoming(key: string, role: LinkRole): string[]; latestExec(testKey: string, version: string): Execution | undefined }
export interface Profile { id: string; name: string; standard: string; rules: Rule[]; roleLabels: Record<Role, string> }
```

- [ ] **Step 1:** `git init`. Write the package.json (scripts: `test: vitest run`, `build:ui: npm --prefix static/app run build`), tsconfig (strict, module ESNext, moduleResolution bundler, include `src`, `test`), the vitest config and `.gitignore` (`node_modules`, `static/app/dist`, `.env`).
- [ ] **Step 2:** `npm i @forge/api @forge/resolver @forge/kvs` and `npm i -D typescript vitest @types/node`.
- [ ] **Step 3:** Write the types and a smoke test that constructs a `TraceSnapshot` literal.
- [ ] **Step 4:** `npm test`, expect PASS.
- [ ] **Step 5:** Commit `chore: scaffold scrutineer forge app and domain types`.

### Task 2: Rule engine + ISO 26262 profile

**Files:**
- Create: `src/engine/context.ts`, `src/engine/iso26262.ts`, `src/engine/gate.ts`, `src/engine/profiles.ts`
- Test: `test/engine/gate.test.ts`, `test/engine/fixtures.ts` (a `mkSnap()` builder helper)

**Interfaces (Produces):**
- `buildContext(snap: TraceSnapshot): RuleContext`.
  - Scope: REQs with `fixVersions` including `snap.release` and `!superseded`.
  - Hazards: those with the release in fixVersions OR mitigated by a scope REQ.
  - Tests: TCs verifying any scope REQ.
  - Links are de-duplicated, and self-links are ignored.
- `evaluateGate(snap: TraceSnapshot, profile?: Profile): GateResult` (default profile ISO 26262).
- `getProfile(id: string): Profile`, `PROFILES: Profile[]`. `iso26262` is the only profile; a synthetic `test-profile` exists in tests only.
- Finding id = `${ruleId}:${primaryKey}`. `keys[0]` is the primary key.

**Rules (exact):**

| id | sev | check | fix | clause |
|---|---|---|---|---|
| R1 | blocking | scope hazard with asil≠QM has no incoming `mitigates` from a non-superseded REQ | create_requirement | ISO 26262-3 §7 / -8 §6 |
| R2 | major | scope REQ has no outgoing `mitigates` and no outgoing `derivedFrom` | trace_up | ISO 26262-8 §6.4.3 |
| R3 | blocking | scope REQ has 0 incoming `implements`, or any implementer's statusCategory≠done | complete_implementation | ISO 26262-6 §7–9 |
| R4 | blocking | scope REQ has 0 incoming `verifies` | create_test | ISO 26262-6 §9 / -4 §7 |
| R5 | blocking | scope TC whose latestExec(tc, release) is missing or not Passed | run_test | ISO 26262-6 §9.4 |
| R6 | blocking | unresolved suspect on a scope TC with no execution where executedAt > changedAt | resolve_suspect | ISO 26262-8 §8 (change management) |
| R7 | major | IMP implementing a scope REQ with asil C or D where reviewerId is missing or = assigneeId | assign_reviewer | ISO 26262-2 §6.4.7 (confirmation measures) |
| R8 | blocking | DEF with outgoing `blocks` to a scope REQ and statusCategory≠done | resolve_defect | ISO 26262-8 §7 |
| R9 | minor | scope REQ asil rank > max asil rank of the hazards it mitigates, and !decomposed | review_asil | ISO 26262-9 §5 |
| R0 | blocking | zero scope REQs | add_scope | — |

- **Verdict:** any blocking → NO_GO; else any major or minor → AT_RISK; else GO.
- **lights:** NO_GO → `min(5, max(1, blockingCount))`, AT_RISK → 5, GO → 0.
- **score:** an integer 0–100. It is `round(100 * (0.15*hazMit + 0.15*reqImpl + 0.2*reqVer + 0.35*testsPass + 0.15*noSuspect))`, where each term is a ratio. An empty denominator gives 1, except reqs=0 gives score 0.
- **Messages:** start with the role-badged key, e.g. `REQ BBW-12 has no verifying test case.`

- [ ] **Step 1:** Write failing tests:
  - `fully traced release → GO, lights 0, score 100`
  - one test per rule R0–R9 asserting exactly one finding with the given id, severity and keys
  - Review Focus 1–4:
    - `empty scope → NO_GO with only R0`
    - `passed on 2.2 only → R5 on 2.3`
    - `suspect then later rerun → no R6`; `suspect with review resolution → no R6`
    - `duplicate links and multi-verify → unique ids`
  - `superseded REQ is out of scope`
  - `QM hazard needs no requirement`
- [ ] **Step 2:** `npm test`, expect FAIL (modules missing).
- [ ] **Step 3:** Implement the context, rules, gate and profiles.
- [ ] **Step 4:** `npm test`, expect PASS.
- [ ] **Step 5:** Commit `feat(engine): ISO 26262 rule engine and release gate`.

### Task 3: Snapshot builder (Jira mapping) + stores

**Files:**
- Create:
  - `src/jira/map.ts`: pure mapping
  - `src/jira/client.ts`: REST calls via `@forge/api`
  - `src/store/kvs.ts`: typed KVS wrappers
  - `src/snapshot/build.ts`: assembles the snapshot
- Test: `test/jira/map.test.ts` with fixture `test/jira/fixtures/search.json`

**Interfaces (Produces):**
- `PROPERTY_KEY = 'scrutineer'`. Issue property value: `{ role: Role; asil?: Asil; reviewerId?: string; superseded?: boolean; decomposed?: boolean; severity?: string }`.
- `LINK_TYPES: Record<LinkRole, { name: string; outward: string; inward: string }>`:
  - mitigates → `{ name: 'Scrutineer Mitigates', outward: 'mitigates', inward: 'is mitigated by' }`
  - implements → `Scrutineer Implements`
  - verifies → `Scrutineer Verifies`
  - derivedFrom → `{ name: 'Scrutineer Derived', outward: 'is derived from', inward: 'is source of' }`
  - blocks → the standard `Blocks` (`outward: 'blocks'`, `inward: 'is blocked by'`)
- `mapIssue(raw: JiraIssue, roleFallback: Record<string, Role>): TraceItem | null`: role comes from the property, else from the issue type name via fallback, else null (ignored).
- `mapLinks(raw: JiraIssue[]): TraceLink[]`. On issue X, an `issuelinks` entry with `outwardIssue: Y` and type name N gives `{ role: roleOf(N), from: X, to: Y }`. Inward entries are skipped, since the other side's outward entry carries the same link. Unknown types are ignored.
- `client.ts`:
  - `searchProjectIssues(projectKey): Promise<JiraIssue[]>`: POST `/rest/api/3/search/jql` with `jql: project = "<key>"`, fields `summary,status,issuetype,fixVersions,assignee,updated,issuelinks`, `properties: ['scrutineer']`, paged with `nextPageToken`.
  - `listVersions(projectKey)`
  - `setIssueProperty(key, value)`
  - `createIssue(fields)`
  - `createLink(role, fromKey, toKey)`: implemented as POST `/rest/api/3/issueLink` with `{type:{name}, inwardIssue:{key: fromKey}, outwardIssue:{key: toKey}}`. Direction is verified on the live site in Task 12, and fixed here only if wrong.
  - `addComment(key, text)`
  - `getMyself()`
  - `searchUsers(query)`
- `kvs.ts`. Key prefixes:
  - `exec:<issueKey>` → `Execution[]`
  - `suspect:<testKey>` → `SuspectFlag[]`
  - `snap:<project>:<release>:latest` → `StoredSnapshot`
  - `evidence:<project>:<release>:<iso>` → `EvidenceRecord`
  - `signoff:<project>:<release>` → `Signoff[]`
  - `settings` → `Settings`
  - Functions: `getExecutions(k)`, `addExecutions(list: {testKey; exec: Execution}[])`, `getSuspects(k)`, `putSuspects(k, flags)`, `getSettings()`, `saveSettings(s)` and similar.
  - `Settings = { defaultProject?: string; evidenceSpaceKey?: string; roleFallback: Record<string, Role>; ingestToken: string; profileId: 'iso26262' }`. `ingestToken` is generated on first read with `crypto.randomUUID()`.
- `build.ts`: `buildSnapshot(projectKey, release): Promise<TraceSnapshot>`. It loads issues, maps them, loads `exec:`/`suspect:` for TC items, and sets `takenAt = new Date().toISOString()`.

- [ ] **Step 1:** Failing tests for `mapIssue`:
  - role from the property
  - role from the type fallback
  - null when there's no role
  - statusCategory mapping `new|indeterminate|done` from `status.statusCategory.key`
  - fixVersions as names

  Failing tests for `mapLinks`: outward-only, de-dupes, ignores unknown types.
- [ ] **Step 2:** Run, expect FAIL.
- [ ] **Step 3:** Implement `map.ts`, `client.ts`, `kvs.ts` and `build.ts`.
- [ ] **Step 4:** Run, expect PASS.
- [ ] **Step 5:** Commit `feat: jira snapshot mapping and kvs stores`.

### Task 4: Change impact (pure + trigger)

**Files:**
- Create: `src/impact/impact.ts` (pure), `src/handlers/trigger.ts`
- Test: `test/impact/impact.test.ts`

**Interfaces (Produces):**
- `downstream(snap: TraceSnapshot, key: string): { items: string[]; tests: string[] }`. A breadth-first walk:
  - HAZ → REQs (incoming mitigates)
  - REQ/DEC → REQs (incoming derivedFrom)
  - REQ → TCs (incoming verifies) and IMPs (incoming implements)
- `upstream(snap, key): string[]`: the reverse walk.
- `TRACE_FIELDS = ['summary','description']`.
- `flagsForChange(snap, changedKey, changedBy, changedAt, fields: string[]): SuspectFlag[]`. It returns `[]` unless the changed item is HAZ/REQ/DEC and the fields intersect `TRACE_FIELDS`. Otherwise it returns one flag per downstream test, with reason `"upstream <ROLE KEY> changed (<fields>)"`.
- Trigger handler `onIssueUpdated(event, context)`:
  1. Read the changelog field names from `event.changelog.items[].field`.
  2. Build the snapshot for the issue's project (release-independent; use all items).
  3. Compute the flags and merge them into KVS, keeping existing unresolved flags and not duplicating the same upstream/test pair while unresolved.
  4. Comment on each test: `⚠ Suspect: upstream REQ BBW-12 changed on <date> by <name>. Re-run or record an impact review in Scrutineer.`
- Manifest: trigger `avi:jira:updated:issue`, `filter.ignoreSelf: true`.
- Also export `resolveSuspect(testKey, upstreamKey, by: 'review', actor, justification)`. It rejects an empty justification.

- [ ] **Step 1:** Failing tests:
  - HAZ change flags tests two levels down
  - REQ change flags only its verifying tests
  - IMP change → `[]`
  - an assignee-only change → `[]`
  - the reason string format
- [ ] **Step 2:** Run, expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run, expect PASS.
- [ ] **Step 5:** Commit `feat: change-impact suspect flagging`.

### Task 5: Results ingestion (pure + webtrigger) + bench sim

**Files:**
- Create: `src/ingest/ingest.ts` (pure parse/validate), `src/handlers/webtrigger.ts`
- Test: `test/ingest/ingest.test.ts`

**Interfaces (Produces):**
- `IngestPayload = { projectKey: string; version: string; runId?: string; runUrl?: string; results: { testKey: string; result: 'passed'|'failed' }[] }`.
- `parseIngest(body: string, knownTests: Set<string>, actor: string, now: string, source: ExecSource): { accepted: {testKey; exec: Execution}[]; rejected: { index: number; reason: string }[]; error?: string }`. Bad JSON or a missing `version`/`results` sets `error`. A bad entry is rejected individually. `reference` is `runUrl ?? runId`.
- Webtrigger handler: header `x-scrutineer-token` must equal `settings.ingestToken`, otherwise 401.
  - Status 400 on `error`.
  - Status 207 if there are any rejections, 200 otherwise.
  - Body: JSON `{accepted: n, rejected: [...]}`.
  - Actor: `"CI (" + (runId ?? 'unknown run') + ")"`.
- `recordBenchRun(testKey, version, actorName): Promise<Execution>`. It reuses `parseIngest` with source `bench-sim`. The result is always `passed` unless the issue property has `benchOutcome: 'fail'`. Actor: `"Simulated HIL bench (requested by <name>)"`.
- `recordManual(testKey, version, result, actorName)` with source `manual`.

- [ ] **Step 1:** Failing tests: a valid batch is all accepted; an unknown key is rejected with the others accepted; a bad result string is rejected; invalid JSON gives an error; a missing version gives an error.
- [ ] **Step 2:** Run, expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run, expect PASS.
- [ ] **Step 5:** Commit `feat: CI results ingestion webtrigger and simulated bench`.

### Task 6: Demo dataset + loader

**Files:**
- Create: `src/demo/dataset.ts` (pure data), `src/demo/loader.ts`
- Test: `test/demo/dataset.test.ts`

**Interfaces (Produces):**
- `DEMO = { project: { key: 'BBW', name: 'Brake-by-Wire ECU' }, versions: ['BBW 2.2','BBW 2.3'], issues: DemoIssue[], links: { role, from, to }[], executions: { ref; exec }[], suspects: { testRef; upstreamRef; ... }[], pages: { title; body; linkTo: ref[] }[] }`. Issues use local refs (`H1`, `R4`, …) that the loader maps to real keys.
- `demoAsSnapshot(release): TraceSnapshot`: refs are used as keys, so the engine can be tested offline.
- Content:
  - Hazards: 6, with ASIL D/D/C/B/A/QM.
  - Requirements: about 14 on 2.3, plus 6 on 2.2. One is superseded (decoy).
  - IMP stories, about 16 TCs, 1 DEF and 2 DECs.
  - Planted 2.3 failures:
    - R4 on "Brake pedal position sensor plausibility check" (ASIL D)
    - R6 on "Wheel-speed sensor redundancy cross-check": the REQ was edited after the TC passed (seeded suspect flag)
    - R8: DEF "Intermittent CAN timeout on brake ECU at −30 °C" blocking "Brake command timeout handling"
    - R7: the ASIL D story "Implement redundant brake actuator command path" has reviewer = assignee
  - Decoys:
    - a TC whose summary mentions R4's requirement but which verifies a different REQ
    - a superseded REQ without tests
- `loadDemo(opts: { accountId: string; createProject: boolean; projectKey?: string }): Promise<LoadReport>`. Steps:
  1. Ensure the project exists (POST `/rest/api/3/project`: company-managed, `projectTypeKey: 'software'`, template `com.pyxis.greenhopper.jira:gh-simplified-kanban-classic`, `leadAccountId`). If that fails, use `opts.projectKey`.
  2. Ensure the link types exist (`GET/POST /rest/api/3/issueLinkType`).
  3. Ensure the versions exist.
  4. Create the issues in bulk (POST `/rest/api/3/issue/bulk`, ≤50 per call), all of issue type `Task`. The role is shown via the property and a label `scrutineer-<role>`.
  5. Set the properties.
  6. Create the links.
  7. Mark 2.2 as released.
  8. Write the executions and suspects to KVS.
  9. Create the Confluence space `BBWSAFE` and spec pages (v1 `POST /wiki/rest/api/space`, v2 `POST /wiki/api/v2/pages`), then remote-link them to the REQs.
  10. Save settings `{defaultProject, evidenceSpaceKey}`.
  - Idempotent: if the project already has issues labelled `scrutineer-demo`, return `{status:'exists'}`.
  - `resetDemo()` deletes the issues labelled `scrutineer-demo` and the related KVS keys.
- `LoadReport = { status: 'created'|'exists'|'partial'; projectKey: string; steps: { name: string; ok: boolean; detail?: string }[] }`.
- Long work runs via `@forge/events` Queue `demo-queue` and consumer `demo-consumer` (timeout 900). The UI polls `getDemoStatus()` from KVS key `demo:status`.

- [ ] **Step 1:** Failing tests (offline, using `demoAsSnapshot`):
  - `BBW 2.3` gives exactly the ids `R4:R4ref, R6:<tc>, R8:<req>` (blocking) and `R7:<imp>` (major), verdict NO_GO
  - `BBW 2.2` → GO
  - no finding references a decoy ref
  - after applying the scripted fixes (add TC verifying R4 + passed exec, resolve suspect by review, DEF done, reviewer≠assignee) → GO, lights 0
- [ ] **Step 2:** Run, expect FAIL.
- [ ] **Step 3:** Write the dataset (engineering-accurate brake-by-wire wording) and the loader.
- [ ] **Step 4:** Run, expect PASS.
- [ ] **Step 5:** Commit `feat: brake-by-wire demo dataset and loader`.

### Task 7: Test-draft template + evidence pack

**Files:**
- Create: `src/drafts/testDraft.ts`, `src/evidence/render.ts` (pure), `src/evidence/publish.ts`
- Test: `test/drafts/testDraft.test.ts`, `test/evidence/render.test.ts`

**Interfaces (Produces):**
- `draftTestCase(req: TraceItem): TestDraft`, where `TestDraft = { summary: string; preconditions: string[]; steps: string[]; expected: string; asil?: Asil }`.
  - Rule-based, no AI.
  - Summary: `Verify: <req summary>`.
  - Steps include a nominal case, a boundary/fault-injection case for ASIL C/D, and timing for summaries containing "ms" or "timeout".
- `createLinkedTest(reqKey, draft, release): Promise<string>`: creates a TC (Task + property role TC + label) with the given fixVersion and links `verifies`.
- `hashSnapshot(snap: TraceSnapshot, gate: GateResult): string`: SHA-256 hex over canonical JSON with sorted keys (node `crypto`).
- `renderEvidencePack(snap, gate, ctx: { siteUrl: string; generatedBy: string; signoffs: Signoff[]; hash: string }): { title: string; storage: string }`.
  - Title: `Scrutineer Evidence Pack — <release> — <YYYY-MM-DD HH:mm UTC>`.
  - Body sections, in Confluence storage format:
    - verdict panel
    - scope and profile
    - traceability matrix table (REQ | ASIL | Hazards | Implementation | Tests | Latest result (source label))
    - findings
    - suspect-link history
    - sign-off table (Safety Manager / Test Lead / Release Manager)
    - integrity (hash + snapshot id)
    - the disclaimer line
  - All text is XML-escaped.
- `publishEvidencePack(projectKey, release, spaceKey, actorName): Promise<{ url: string; hash: string }>`. It stores an `EvidenceRecord {url, hash, verdict, at, by}`.

- [ ] **Step 1:** Failing tests:
  - draft for an ASIL D REQ includes a fault-injection step
  - hash is stable across key order and changes when one exec changes
  - render escapes `<&>`, contains the matrix row for each scope REQ, the source labels "simulated HIL bench" and "manual attestation by", and the disclaimer
- [ ] **Step 2:** Run, expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run, expect PASS.
- [ ] **Step 5:** Commit `feat: rule-based test drafts and confluence evidence pack`.

### Task 8: Resolvers, Rovo actions, MCP tools, validator, sign-offs

**Files:**
- Create:
  - `src/handlers/resolver.ts`
  - `src/handlers/actions.ts`
  - `src/handlers/validator.ts`
  - `src/service.ts`: shared orchestration used by all three handler files
  - `src/signoff.ts`
- Modify: `src/index.ts` (re-export all handlers)
- Test: `test/service.test.ts` (with `client`/`kvs` mocked via `vi.mock`)

**Interfaces (Produces):**
- `service.ts`:
  - `getReadiness(projectKey, release): Promise<{ gate: GateResult; snap: TraceSnapshot }>`: caches to `snap:...:latest`.
  - `explainFinding(projectKey, release, findingId)`: returns `{ finding, rule: {title, clause}, evidence: TraceItem[], howToFix: string }`.
  - `traceImpact(projectKey, key)`: returns `{ upstream, downstream, wouldFlag }`.
  - `applyFix(projectKey, release, findingId, input)` handles:
    - `create_test` → createLinkedTest
    - `run_test` → recordBenchRun (demo project only, else error "Record a CI or manual result")
    - `resolve_suspect` → review with justification
    - `assign_reviewer` → set property reviewerId
    - `resolve_defect` → transition the DEF to its first done-category transition
  - `resolveProject(input?)`: input, else settings.defaultProject, else error `No project. Load the demo or set a default project in Scrutineer settings.`
  - `resolveRelease(projectKey, input?)`: input, else the first unreleased version.
- Resolver definitions:
  - `getContextInfo`
  - `listReleases`
  - `getReadiness`
  - `explainFinding`
  - `traceImpact`
  - `getIssueTrace(issueKey)`: returns `{item, upstream, downstream, executions, suspects}`
  - `draftTest`
  - `applyFix`
  - `recordManualResult`
  - `runBench`
  - `resolveSuspect`
  - `setIssueMeta`: role, asil, reviewer. Editing the asil of a HAZ/REQ also calls flagsForChange with fields `['asil']` treated as a trace field.
  - `publishEvidence`
  - `listEvidence`
  - `signOff`
  - `listSignoffs`
  - `getSettings`, `saveSettings`
  - `getIngestInfo`: `{url: webTrigger.getUrl('results-ingest'), token}`
  - `loadDemo`, `getDemoStatus`, `resetDemo`
  - `searchUsers`
- Rovo actions (`actions.ts`, each `async (payload, context)`; inputs are top-level; the project comes from `payload.projectKey ?? payload.context?.jira?.projectKey`):

  | action key | verb | inputs |
  |---|---|---|
  | `get-release-readiness` | GET | projectKey?, release? |
  | `list-findings` | GET | projectKey?, release? |
  | `explain-finding` | GET | findingId (or issueKey), projectKey?, release? |
  | `trace-impact` | GET | issueKey |
  | `draft-test-case` | GET | requirementKey |
  | `create-linked-test` | CREATE | requirementKey, summary, steps (string, newline-separated), expected, release? |
  | `link-issues` | CREATE | fromKey, toKey, linkRole (mitigates, implements, verifies, derivedFrom) |
  | `publish-evidence-pack` | CREATE | projectKey?, release?, spaceKey? |

  Every action returns compact JSON and a `summary` string with role-badged keys.
- MCP (`rovo:mcp` key `scrutineer-mcp`, name `Scrutineer`) tools: `get-release-readiness`, `list-findings`, `explain-finding`, `trace-impact` (read-only).
- Validator `validateRelease(args)`:
  - Applies only if the issue has label `release-gate`, otherwise returns `{result:true}`.
  - Release = the issue's first fixVersion.
  - NO_GO → `{result:false, errorMessage:'Scrutineer: <release> is NO-GO — <n> blocking findings. Open the Control Room.'}`.
- `signoff.ts`: `signOff(projectKey, release, role, accountId, name)` is allowed only when the latest gate is GO. It stores `{role, accountId, name, at, hash}`; one per role, and a newer one replaces the older.

- [ ] **Step 1:** Failing tests:
  - `resolveProject` precedence
  - `resolveRelease` picks the first unreleased version
  - `applyFix('run_test')` refuses outside the demo project
  - `signOff` refuses on NO_GO
  - the validator passes non-gate issues and blocks a NO_GO gate issue
- [ ] **Step 2:** Run, expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run, expect PASS.
- [ ] **Step 5:** Commit `feat: resolvers, rovo actions, mcp tools, release validator, sign-offs`.

### Task 9: Custom UI (Control Room, Issue Panel, Admin)

**Files:**
- Create in `static/app/`:
  - `package.json`, `vite.config.ts` (`base: './'`), `index.html`
  - `src/main.tsx`: routes on `extension.type` (`jira:projectPage` | `jira:issuePanel` | `jira:adminPage`)
  - `src/api.ts`: typed `invoke` wrappers
  - `src/styles.css`: design tokens with `--ds-*` fallbacks; dark mode via `view.theme.enable()`
  - `src/components/StartLights.tsx`
  - `src/components/StatTiles.tsx`
  - `src/components/Findings.tsx`
  - `src/components/TraceMatrix.tsx`
  - `src/components/TraceGraph.tsx`: an SVG column layout, HAZ | REQ | IMP | TC | DEF; red edges for gaps, dashed amber for suspect
  - `src/components/RoleBadge.tsx`
  - `src/components/ConfirmDialog.tsx`
  - `src/components/FixDrawer.tsx`: the draft test editor, justification form and reviewer picker
  - `src/views/ControlRoom.tsx`
  - `src/views/IssuePanel.tsx`
  - `src/views/Admin.tsx`: demo loader with progress, settings, ingestion URL + token + curl example, sign-off list
  - `public/icon.svg`
- Test: `static/app/src/components/StartLights.test.tsx` (vitest + jsdom): lights=5 renders 5 lit; GO renders 0 lit and the "GO" label.

**Requirements:**
- StartLights: five circles. On a transition to GO, lights go out left to right at 180 ms intervals, then "GO" fades in. Amber for AT_RISK. Respects `prefers-reduced-motion`.
- Every write button opens ConfirmDialog, showing exactly what will be created or changed.
- Empty states:
  - no project → a "Load demo project" CTA linking to the Admin page
  - no releases → guidance text
- Footer disclaimer (Global Constraints).
- "Ask Scrutineer" button: copies a prompt (`Explain finding <id> for <release>`) to the clipboard and shows a toast "Paste into Rovo chat with the Scrutineer agent". A deep-link API is not assumed.

- [ ] **Step 1:** Scaffold the Vite React TS app; `npm i @forge/bridge react react-dom`, dev: `vite @vitejs/plugin-react typescript vitest jsdom @testing-library/react`.
- [ ] **Step 2:** Write the failing StartLights test, then run it: FAIL.
- [ ] **Step 3:** Implement the components and views.
- [ ] **Step 4:** `npm test` passes; `npm run build` emits `static/app/dist/index.html`.
- [ ] **Step 5:** Commit `feat(ui): control room, issue panel and admin views`.

### Task 10: Manifest, lint, docs, submission assets

**Files:**
- Modify: `manifest.yml` (full)
- Create:
  - `README.md`: what it is, install, demo walkthrough, CI ingestion example, architecture, zero-cost note
  - `skill.md`: guidance for external agents using the MCP tools
  - `docs/submission/devpost.md`: inspiration, what it does, how we built it, challenges, accomplishments, what's next, plus per-bonus write-ups
  - `docs/submission/video-script.md`: shot list with exact clicks, matching spec §8
  - `docs/submission/marketplace-listing.md`

**Manifest modules:**
- `jira:projectPage` key `control-room`, title `Scrutineer`
- `jira:issuePanel` key `trace-panel`, title `Scrutineer Trace`, icon `resource:main;icon.svg`
- `jira:adminPage` key `admin`, title `Scrutineer`, `useAsConfig: false`
- `rovo:agent` key `scrutineer-agent`, name `Scrutineer`, with the prompt from `prompts/agent.md` (resource) and conversation starters:
  - "Is the current release ready to ship?"
  - "Why is the release gate red?"
  - "Draft the missing test case"
  - "What breaks if I change this requirement?"
- 8 `action` modules
- `rovo:mcp` key `scrutineer-mcp`
- `trigger` key `issue-updated`
- `webtrigger` key `results-ingest` (`response.type: dynamic`)
- `jira:workflowValidator` key `release-guard`
- `consumer` key `demo-consumer` (queue `demo-queue`)
- functions: `resolver`, `actions-fn` (one handler per action), `trigger-fn`, `ingest-fn`, `validator-fn`, `demo-fn`
- resources: `main` → `static/app/dist`, `prompts` → `prompts`
- scopes:
  - Jira: `read:jira-work write:jira-work read:jira-user manage:jira-project manage:jira-configuration`
  - Storage: `storage:app`
  - Confluence: `read:confluence-content.summary write:confluence-content read:confluence-space.summary write:confluence-space read:page:confluence write:page:confluence read:space:confluence`
- `permissions.content.styles: ['unsafe-inline']`

**Agent prompt requirements:**
- Persona: a calm technical inspector.
- Always cite role-badged keys.
- Before any CREATE action, show the exact draft and ask "Shall I create it?", and call the action only after an explicit yes.
- Never claim certification.
- If the project is unknown, call get-release-readiness without inputs, so the default project is used.

- [ ] **Step 1:** Write the manifest.
- [ ] **Step 2:** `forge lint`: expect no errors. Fix any reported scope or module issues.
- [ ] **Step 3:** Write the docs.
- [ ] **Step 4:** `npm test` (root + UI) all pass; `npm run build:ui` succeeds.
- [ ] **Step 5:** Commit `feat: full manifest, docs and submission assets`.

### Task 11: Deploy + live verification (needs Aditya's `forge login`)

- [ ] **Step 1:** Aditya runs `forge login`. Then `forge register scrutineer` (writes app.id) and `forge site provision` (demo site). Confirm Rovo is present on the site.
- [ ] **Step 2:** `npm run build:ui && forge deploy && forge install --demo-site --product jira`, then `--product confluence`.
- [ ] **Step 3:** In the Admin page, Load demo and wait for status `created`. Open Control Room for `BBW 2.3`: expect NO_GO with exactly 4 findings.
- [ ] **Step 4:** Verify the link direction: a TC shows "verifies REQ" in the Jira UI. If it's reversed, swap `inwardIssue`/`outwardIssue` in `createLink`, add a regression note, `resetDemo`, and reload.
- [ ] **Step 5:** Run the full demo script (spec §8). Expect GO with lights out. Publish the evidence pack and check the Confluence page.
- [ ] **Step 6:** Rovo:
  - ask the agent "Why is the release gate red?" → cites the 4 findings
  - draft and create a test only after confirmation
- [ ] **Step 7:** Edit a REQ summary → within about 3 minutes the TC is flagged suspect and has the comment.
- [ ] **Step 8:** `forge webtrigger create --functionKey ingest-fn`, then curl a result. Expect 200 and the execution to show as `ci`.
- [ ] **Step 9:** MCP: enable external exposure and connect MCP Inspector to `https://mcp.atlassian.com/forge/<appId>`. Call `get-release-readiness`.
- [ ] **Step 10:** Fix anything that broke, then commit `fix: live verification adjustments`.
