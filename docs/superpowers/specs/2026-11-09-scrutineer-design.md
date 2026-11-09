# Scrutineer — Design

**Hackathon:** Codegeist 2026 ("Build with context. Ship with confidence."), Atlassian / Devpost
**Category:** Apps for Specialized Industries
**Deadline:** Dec 22, 2026, 12:00 PM PT (Dec 23, 01:30 IST). Build target: feature-complete as fast as possible, with **every module (including should-haves) in the manifest before the Marketplace listing is submitted**, aiming for no later than Dec 5. Changes after listing are copy/UI only, so no re-review is triggered by new scopes.
**Team:** solo entrant (Aditya); Claude builds the code.
**Date:** 2026-11-09

> In motorsport, **scrutineering** is the technical inspection every car must pass before it may race.
> Scrutineer does the same for safety-critical software: **no release leaves the garage unverified.**

---

## 1. Intent: why this exists

Teams that build software for cars (ISO 26262), medical devices (IEC 62304) and aircraft (DO-178C) may not ship until they can prove an unbroken chain for every safety-relevant item:

```
Hazard ─► Safety requirement ─► Implementation ─► Verification test ─► Passing result (on this release)
```

Today the proof is assembled by hand in spreadsheets before every release and audit. That takes weeks, gaps are found late, and a requirement edited after its test passed (a "suspect" link) is routinely missed. Dedicated tools (Jama, Polarion, codeBeamer) are expensive and live outside Jira, where the work actually happens.

Scrutineer lives inside Jira and Confluence. It computes the trace chain from real Jira data, runs a release gate with a go/no-go verdict backed by evidence, flags anything a change has made suspect, and uses a Rovo agent to explain gaps and draft fixes, which a human approves. With one click it publishes an evidence pack to Confluence that an auditor can read.

**Why it should win** (the judging criteria are 20% each):
- **Theme fit:** the trace chain is the *context*; the evidence-backed gate is the *confidence*.
- **Impact:** a specific, costly pain that the law requires teams to solve, with an obvious buyer.
- **Innovation:** it targets a niche most entrants won't touch. Expect most entries to be summarizers, triage bots or decision-memory tools. The core is deterministic rather than an LLM wrapper.
- **Technical implementation:** Jira and Confluence, a Rovo agent with actions, `rovo:mcp`, event triggers, a workflow validator, and Custom UI.
- **Presentation:** one memorable moment. The start lights stay red, the agent finds the gap, drafts the missing test and links it, the lights go out ("GO"), and the evidence pack appears.

## 2. Goals, non-goals, anti-goals

**Goals**
1. A judge installs Scrutineer from the install link, clicks **"Load demo project"**, and within about 60 seconds sees a full, working, realistic safety project with a red gate. No API keys and no configuration.
2. Every finding is **deterministic, explainable, and cites the exact Jira issues and links involved**. Zero false positives on the demo data.
3. The Rovo agent can explain any finding, trace the impact of any issue, draft a missing test or requirement, and create or link it **only after explicit user confirmation**.
4. Change-impact: editing an upstream item marks downstream verification as **suspect** automatically, in real time, through a Jira event trigger.
5. One-click Confluence **evidence pack** with a traceability matrix, gate verdict, findings, sign-off block and a SHA-256 snapshot hash for tamper-evidence.
6. The same capabilities are exposed as **MCP tools** (`rovo:mcp`), plus a `skill.md`, so an external AI agent can ask "Is release 2.3 shippable?"
7. Visual polish good enough to score on Design: a "Control Room" page with a start-lights hero (five red lights that go out on GO), coverage stats, a trace matrix heatmap, and an interactive trace graph.

**Non-goals**
- Not a full ALM or test-management tool. It reads tests modelled as Jira issues and does not run tests.
- Not certified compliance. It supports evidence gathering and does not claim certification. The UI and video say so.
- Not covering every clause of every standard. ISO 26262 is the only profile in the must-have scope. The engine is profile-driven, so a second standard is a data change (see could-have §6.14, IEC 62304 with its own small dataset). A medical-device profile is never shown running on brake data.
- No external LLM provider. All generative AI goes through Rovo.

**Anti-goals** (failure even if it "works")
- The AI ever silently creates, edits, links or closes anything. Every write is confirmed.
- A finding that is wrong, or that can't show its evidence.
- An install that needs manual setup or keys, or that breaks on a fresh site.
- A UI that looks like a proof of concept: raw tables, default styling, empty states with no guidance.
- Over-claiming in the video, such as "certified" or "replaces your auditor".

## 3. Constraints

- **Platform:** Atlassian Forge (Node.js runtime, TypeScript). Must contain a Forge manifest and at least one Forge module, and be built after Oct 27, 2026. It is.
- **Products:** Jira (primary) and Confluence (evidence pack). Bitbucket is optional (§7).
- **Zero cost (hard rule from Aditya):** everything must run on free plans only.
  - Dev/demo environment: a **Forge demo development site** (`forge site provision` / `forge install --demo-site`). Atlassian docs describe it as "a fully featured Atlassian cloud site with realistic seeded data and enterprise editions of Jira, Confluence, Jira Service Management, and Rovo". Free, 90 days (provisioned ~Nov 9 → active until ~Feb 7, 2027, covering submission and judging), one per developer. Verify Rovo actually appears on the provisioned site before relying on it.
  - Regular Free-plan Jira/Confluence sites do **not** include Rovo (Rovo = Standard/Premium/Enterprise only).
  - The Forge platform's free monthly allowance per app (functions 200k GB-s, KVS 0.1 GB r/w, logs 1 GB) is far above our needs. Stay within KVS/custom entities; avoid Forge SQL and Object Store unless needed.
  - **Forge LLMs API: never used.** It has no free allowance. All generative AI goes through the Rovo agent, which runs on the demo site's Rovo.
  - MCP demo client: a free MCP client (e.g. the open-source MCP Inspector). `rovo:mcp` external exposure must be enabled by the site admin, which is us on the demo site.
- **AI design consequence:** Rovo is the only AI and is **strictly additive**. Every finding, fix, test draft template, change-impact flag and evidence pack must work fully with Rovo absent. Deterministic "Fix" buttons cover every agent write action, and the test-draft button uses a rule-based template. On a judge's site without Rovo, the app is still complete. If Rovo credits on the demo site run out during recording, the video uses the deterministic path.
- **Preview APIs:** `rovo:mcp` and the Teamwork Graph API are Preview. The core experience must not depend on either.
- **Judging:** judges install from a link on their own site. Everything must work on a fresh site with Jira, Confluence and Rovo enabled.
- **Video:** public YouTube, under 5 minutes. Judges may stop at 3:00, so the key moment must land before 2:30. No copyrighted music, and no third-party trademarks such as Williams logos.
- **Runs on Atlassian:** keep all data in Forge storage, with no egress. It isn't a 2026 bonus, but it's a strong trust and impact talking point for regulated industries.
- **Naming:** the name must not use Atlassian product names (Marketplace rule). "Scrutineer" complies.

## 4. The domain model (decided)

Everything is modelled with **standard Jira issues, issue links and a few fields**, so the trace is real Jira data and not a shadow database.

**One Jira project per safety program** (demo: `BBW`). Issue keys are therefore `BBW-n`. The item role (Hazard, Requirement, …) is shown everywhere by a coloured **role badge** (HAZ / REQ / IMP / TC / DEF / DEC) next to the key, e.g. `REQ BBW-12`. All copy, comments, video and evidence pack use this form. Fix versions are project-scoped, which keeps release scope a simple JQL query.

**Issue types** (created by the demo loader in the project; real users map their own types in Settings):

| Type | Role badge | Key fields |
|---|---|---|
| Hazard | HAZ | ASIL (QM, A, B, C, D) |
| Safety Requirement | REQ | ASIL (inherited or explicit) |
| Story / Task (implementation) | IMP | status, assignee, reviewer |
| Test Case | TC | Last result (Passed / Failed / Not run), Result version, Executed at |
| Defect | DEF | severity |
| Safety Decision (optional) | DEC | e.g. "ASIL-D braking requires redundant wheel-speed sensing" |

**Link types** (created by the loader if missing):
- `mitigates`: REQ → HAZ
- `implements`: IMP → REQ
- `verifies`: TC → REQ
- `derived from`: REQ → REQ or DEC
- Defects use the standard `blocks` link: DEF → REQ

**Release** = a Jira **fix version** (e.g. `BBW 2.3`). The release scope is every REQ with that fix version, plus everything linked to them.

**Confluence:** design and spec pages are attached to REQs as remote links (shown as evidence). Evidence packs are published to a Confluence space the user picks (the demo loader creates one).

**Test executions (decided: evidence must never be faked).** A test's result is a list of **execution records**: `{result, version, executedAt, source, actor, reference}`. Sources:
- `ci`: posted to Scrutineer's **results ingestion webtrigger** (Forge `webtrigger`, JSON body listing test keys, results, version, run ID/URL). This is how real CI and HIL benches report.
- `manual`: entered in the issue panel and labelled **"manual attestation by <user>"** everywhere it appears, including the evidence pack.
- `bench-sim`: the demo's **"Run on HIL bench (simulated)"** button calls the same ingestion code path with a deterministic simulated bench result, clearly labelled "simulated" in the UI and evidence pack. Only shown in the demo project.

The latest execution for the release version decides R5. The evidence pack lists the source of every result.

**Suspect resolution has two honest paths** (ISO 26262 change-impact analysis):
1. **Re-run:** a new execution (ci / bench-sim / manual) after the upstream change clears the suspect flag.
2. **Impact review:** a reviewer records "Test remains valid" with a mandatory written justification. It is stored with user and time, clears the flag, and is shown in the evidence pack's suspect-link history.

**Field storage choice:** using Jira custom fields gives the most authentic data, but Forge custom fields add setup work. **Builder's call:** start with Forge **issue properties** (entity properties) for ASIL, test result and so on, shown and edited through the Scrutineer issue panel. Promote to Forge custom fields only if time allows. Either way the demo loader sets everything.

## 5. The rule engine (decided): the deterministic core

A pure TypeScript module with no Forge dependencies, so it can be unit-tested heavily. Input: a trace snapshot (issues + links + properties for one release). Output: findings + a verdict.

**ISO 26262 profile, rules:**

| ID | Rule | Severity |
|---|---|---|
| R1 | Every Hazard with ASIL ≥ A has ≥1 Safety Requirement that `mitigates` it | Blocking |
| R2 | Every Safety Requirement traces up to ≥1 Hazard (or a Decision via `derived from`) | Major |
| R3 | Every Safety Requirement has ≥1 `implements` item, and all are Done | Blocking |
| R4 | Every Safety Requirement has ≥1 `verifies` Test Case | Blocking |
| R5 | Every verifying Test Case has Last result = Passed **on this release's version** | Blocking |
| R6 | **Suspect link:** an upstream item (HAZ/REQ/DEC) changed after the downstream test's Executed at, so the verification is stale | Blocking |
| R7 | **Independence:** ASIL C/D implementation items have a reviewer ≠ assignee | Major |
| R8 | No open Defect `blocks` a Safety Requirement in scope | Blocking |
| R9 | ASIL decomposition sanity: a REQ's ASIL ≤ the max ASIL of the hazards it mitigates, unless marked decomposed | Minor |

**Verdict:** any failing Blocking rule → **NO-GO** (red). Only Major/Minor failures → **AT RISK** (amber). Otherwise → **GO** (green).
**Readiness score:** weighted coverage percentage, shown alongside the verdict but never overriding it.

**Profiles are data:** a profile = rule set + labels + role names. Must-have ships ISO 26262 only. The engine is unit-tested against a second synthetic profile to prove the abstraction (IEC 62304 demo is could-have §6.14).

Every finding carries: rule ID, plain-English message, severity, the issue keys involved, the missing or offending link, and a suggested fix type (`create_test`, `link_existing`, `rerun_test`, `assign_reviewer`, …) that the agent and UI use.

## 6. Features and surfaces

### Must-have (the demo depends on these)

1. **Control Room** (Jira project page, Custom UI, React)
   - Release selector (fix versions) and profile selector.
   - **Start-lights hero:** five red lights, lit according to blocking findings. When the gate passes, the lights go out in sequence with the label "GO". Amber state for AT RISK.
   - Stat tiles: coverage (hazards mitigated, requirements verified, tests passing), suspect count, open blockers.
   - **Findings list:** grouped by severity, each with evidence keys (clickable), "Ask Scrutineer" (opens the Rovo agent with context) and a direct "Fix" action where one is deterministic.
   - **Trace matrix:** REQ rows × columns (Hazard / Impl / Test / Result), cells colour-coded.
   - **Trace graph:** interactive node-link view of the release (HAZ → REQ → IMP/TC), red edges for gaps and dashed amber edges for suspect links. Click a node to open the issue.

2. **Issue panel "Trace"** (Jira issue panel, all trace-relevant issue types)
   - Upstream and downstream chain for this issue, with status badges and a suspect badge.
   - Edit Scrutineer properties (ASIL, role).
   - On Test Cases: execution history (source-labelled), "Record manual result" (attestation), and in the demo project "Run on HIL bench (simulated)".
   - On suspect tests: "Re-run" or "Impact review: still valid" (justification required). See §4.

3a. **Results ingestion webtrigger** (`webtrigger`): accepts CI/HIL results as JSON and records `ci` executions. The README documents a curl/GitHub Actions example. The demo bench button reuses this code path.

3. **Change-impact trigger** (`avi:jira:updated:issue`)
   - When a HAZ/REQ/DEC summary, description or ASIL changes, every downstream Test Case is marked **suspect**, with the reason and timestamp, and a short comment is added on the test ("⚠ Suspect: upstream REQ BBW-12 changed on <date> by <user>"). Purely deterministic.

4. **Rovo agent "Scrutineer"** (`rovo:agent` + `action` modules)
   - Persona: a calm motorsport-style technical inspector. Precise, cites issue keys, never claims certification.
   - Actions (each backed by a Forge function using the rule engine):
     - `get-release-readiness(release)`: verdict + findings summary
     - `explain-finding(findingId | issueKey)`: why it fails, which standard clause it relates to, how to fix it
     - `trace-impact(issueKey)`: everything downstream/upstream, including what goes suspect if it changes
     - `draft-test-case(reqKey)`: returns a proposed test (title, preconditions, steps, expected result) **as a draft only**
     - `create-linked-issue(draft, type, linkTo)`: **write action, confirmation required**
     - `link-issues(from, to, linkType)`: **write action, confirmation required**
     - `publish-evidence-pack(release, spaceKey)`: **write action, confirmation required**
   - The agent's instructions require it to present drafts and ask for confirmation before any write action. The UI-side buttons also confirm.

5. **Confluence evidence pack**
   - A page titled "Scrutineer Evidence Pack — <release> — <date>" containing: verdict, profile, scope, the full traceability matrix, findings (or "none"), suspect-link history, tooling statement, a sign-off table (roles: Safety Manager, Test Lead, Release Manager), and a **SHA-256 hash of the snapshot JSON** plus the snapshot ID stored in Forge storage. Anyone can re-verify that the pack matches the recorded snapshot.
   - The pack is also listed in the Control Room ("Evidence history").

6. **Demo loader** (Jira admin page or a Control Room empty state: "Load demo project")
   - Creates (or uses) a project "Brake-by-Wire ECU" (key `BBW`), the issue types and link types, fix versions `BBW 2.2` (all green, already shipped) and `BBW 2.3` (in progress), about 6 hazards, about 14 requirements, implementation stories, about 16 test cases, 1 defect, 1–2 decisions, and a Confluence space with a few spec pages.
   - The data is engineered so `BBW 2.3` fails exactly these (the demo script relies on it):
     - R4: REQ for "Brake pedal sensor plausibility check" has **no verifying test** (agent drafts it in the demo)
     - R6: a REQ whose wording was edited after its test passed, so it is **suspect**
     - R8: one open defect blocking a REQ
     - R7: one ASIL-D story where reviewer = assignee (Major, amber-level)
   - It also contains **decoys** that must *not* be flagged: a test that mentions a REQ in its text but correctly verifies a different one, and a superseded requirement excluded from scope. These prove the engine doesn't guess.
   - Idempotent: running it twice doesn't duplicate data (offer "Reset demo").

7. **Settings page** (Jira admin page): map issue types and link types to Scrutineer roles, choose the profile, choose the evidence space. The defaults match the demo loader, so judges never need to touch it.

### Should-have (build after all must-haves are polished)

8. **MCP server** (`rovo:mcp`, Preview): expose `get_release_readiness`, `list_findings`, `trace_impact`, `explain_finding` (read-only tools only, so nothing can write without the Rovo confirmation flow). Ship `skill.md` in the repo describing how an external agent should use them. Demo: Claude (or another MCP client) answers "Is BBW 2.3 shippable?" with cited findings.
9. **Release workflow guard** (`jira:workflowValidator`): optionally blocks moving a "Release" issue (or a version-tracking issue) to Done while the gate is NO-GO, with the reason. If version release itself can't be intercepted, this is the hook.
10. **Sign-off capture:** named approvers click "Approve" on a GO snapshot. The approval is stored with user, time and snapshot hash, and shown in the evidence pack.

### Could-have (only if far ahead)

11. **Teamwork Graph enrichment** (Preview): find likely-but-unlinked evidence (Confluence pages and Bitbucket PRs related to a REQ) and offer them as "suggested links" with confirmation. It never affects the verdict on its own.
12. **Bitbucket:** show PRs connected to implementation stories in the trace graph.
13. **Trend:** readiness over time per release (from stored snapshots).
14. **IEC 62304 profile + "Infusion Pump Controller" mini demo dataset** (`INF` project, ~8–10 items, safety class instead of ASIL, SOUP items). Shown in one video frame only if built.

## 7. Architecture (decided at a high level)

```
Forge app (TypeScript, Node runtime)
├── manifest.yml
│   ├── jira:projectPage        → Control Room (Custom UI, React + Vite)
│   ├── jira:issuePanel         → Trace panel (Custom UI)
│   ├── jira:adminPage          → Settings + Demo loader
│   ├── trigger (avi:jira:updated:issue) → change-impact
│   ├── rovo:agent + action ×7  → Scrutineer agent
│   ├── rovo:mcp                → read-only tools (should-have)
│   └── jira:workflowValidator  → release guard (should-have)
├── src/engine/      pure rule engine + profiles (unit-tested, no Forge imports)
├── src/snapshot/    builds a trace snapshot from Jira REST (search by fixVersion, links, properties)
├── src/resolvers/   Custom UI bridge resolvers
├── src/actions/     Rovo action handlers
├── src/confluence/  evidence pack renderer (storage format / ADF)
├── src/demo/        demo loader + reset
└── static/          Custom UI apps
Storage: Forge KVS / custom entities for snapshots, suspect flags, sign-offs, evidence history, settings.
```

- Jira and Confluence access through `@forge/api` (`asApp` for background work like triggers and the loader; `asUser` where user permissions should apply to reads shown to a user).
- No external egress.

## 8. Demo video script (decided outline, ≤ 3:00 for the core)

| Time | Beat |
|---|---|
| 0:00–0:20 | Hook: "Before a car can race, it must pass scrutineering. Before brake software can ship, every hazard must trace to a passing test. Teams prove that in spreadsheets." |
| 0:20–0:40 | Control Room for `BBW 2.3`: start lights **red**, 4 findings, trace graph with red edges. |
| 0:40–1:05 | Click the R4 finding → "Ask Scrutineer". The agent explains the gap (cites the key and clause) and drafts a test. The user confirms, and the test is created and linked (status: Not run, so the gate stays red, which is honest). |
| 1:05–1:15 | On the new test: "Run on HIL bench (simulated)" → execution recorded with source label → Passed. |
| 1:15–1:30 | Suspect link: live-edit a requirement, the downstream test is instantly flagged and a comment appears. Resolve via "Impact review: still valid" with a written justification. |
| 1:30–1:45 | Resolve the defect and reviewer (fast cut). |
| 1:45–2:05 | **The moment:** refresh, the five lights go out, **GO**. |
| 2:05–2:25 | Publish evidence pack → Confluence page with matrix, verdict and hash. |
| 2:25–2:45 | MCP: an external agent asks "Is BBW 2.3 shippable?" and gets a cited answer. |
| 2:45–3:00 | Close: impact (weeks → minutes), built on Forge, data never leaves Atlassian, IEC 62304 profile shown in one frame. |
| 3:00–4:30 | Optional deep dive: rule engine, decoys not flagged, architecture. |

## 9. Prize strategy

- Category: **Apps for Specialized Industries** (automotive named explicitly in the category description).
- Bonus entries (one bonus max can be won; enter all we qualify for): **Best Agents** (Rovo agent + actions), **Best app with Atlassian MCP** (if §6.8 ships), **Best Marketplace published app** (submit for review by ~Dec 5; needs Aditya's vendor account), **Teamwork Graph** (only if §6.11 ships).
- Write-ups per bonus go in the Devpost submission.
- **Priority if bonuses conflict:** protect **Best Agents** (core to the product). If a Preview module (`rovo:mcp`) blocks or delays Marketplace approval, either submit the listing without it (keeping MCP in the judges' install-link build only, which is permitted as a separate distribution) or drop the Marketplace bonus. Never let Marketplace work delay the core.

## 9a. Builder's calls (made during the design review, check these)

1. One project (`BBW`), `BBW-n` keys, role badges instead of per-type key prefixes.
2. Test results come from a results-ingestion webtrigger (CI/HIL). The demo uses a clearly labelled *simulated* bench through the same path. Manual results are allowed but labelled as attestations. Evidence is never silently faked.
3. Suspect links clear by either a re-run or an impact review with a mandatory justification.
4. IEC 62304 moved from must-have to could-have, with its own mini dataset. It is never run on brake data.
5. All modules go into the manifest before the Marketplace listing is submitted. Best Agents is the protected bonus.

## 10. Who does what

**Claude (builder):** all code, tests, manifest, demo data, Confluence pack template, `skill.md`, README, Devpost text, video script and shot list, Marketplace listing copy.

**Aditya (only things that need a human account or face):**
1. Create a free Atlassian account. After `forge login`, Claude runs `forge site provision` to get the free demo dev site (enterprise Jira + Confluence + Rovo, 90 days). If the demo-site pool is at capacity, retry later; the free `go.atlassian.com/cloud-dev` site is the fallback (no Rovo, everything else works).
2. Install the Forge CLI and run `forge login` (needs an API token; interactive). Claude can run every command after that.
3. Generate the judges' install link (developer console → Distribution → Sharing).
4. Record and upload the video (Claude provides the script and the exact click path).
5. Marketplace vendor account and listing submission (should-have).
6. Submit on Devpost.

## 11. Left to the builder

- Custom UI component library and styling (Atlaskit vs custom), graph library choice (e.g. React Flow or Cytoscape), animation details for the start lights. It must look polished and native-feeling in Jira.
- Issue properties vs custom fields (start with properties; see §4).
- Exact demo issue texts (they must read like a real brake-by-wire project; engineering-accurate wording).
- Snapshot caching strategy and pagination.
- Test framework (e.g. Vitest) and coverage targets for the engine.

## 12. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Rovo agent behaves inconsistently in the live demo | Deterministic UI buttons do the same fixes; the video can use either path. Tight agent instructions. |
| `rovo:mcp` / TWG Preview APIs change or are unavailable | Both are should/could-have; the core doesn't depend on them. |
| Creating issue types and link types via API needs admin scopes | The demo loader runs as app with the required scopes. Fallback: reuse the existing types "Task"/"Story" + labels, and generic link types with Scrutineer roles mapped in Settings. |
| Forge function timeouts on large snapshots | Demo scale is small. Paginate, cache snapshots in storage, use async events for the loader. |
| Judges' site lacks Rovo | The Control Room, rules, evidence pack and change-impact all work without Rovo. The agent is additive. |
| Domain credibility | Accurate ISO 26262 terminology (ASIL, safety goal, confirmation measures, suspect links); disclaimers. No certification claims. |
