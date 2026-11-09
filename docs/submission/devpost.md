# Scrutineer: Devpost submission text

**Tagline:** No release leaves the garage unverified. A traceability release gate for safety-critical software, inside Jira and Confluence.

**Category:** Apps for Specialized Industries (automotive functional safety, ISO 26262)

**Bonus prizes entered:** Best Agents (Rovo); Best app with Atlassian MCP; Best Marketplace published app (if listed in time)

---

## Inspiration

In motorsport, every car goes through *scrutineering* before it may race: a technical inspection that checks it against the rules. Safety-critical software has the same gate, but no inspector.

Teams building software for cars must prove an unbroken chain for every safety-relevant item before they ship (ISO 26262):

> hazard → safety requirement → implementation → verification test → a passing result on this release

That proof is usually rebuilt by hand in spreadsheets before every release and audit. It takes weeks. Gaps are found late. Above all, a requirement edited *after* its test passed (a "suspect link") slips through. The work already lives in Jira and Confluence, so the proof should live there too.

## What it does

Scrutineer turns Jira into a scrutineering bay:

- **Control Room:**
  - a start-light gantry for each release, whose lights go out when it's GO
  - a readiness score, coverage, and findings with one-click fixes
  - an interactive trace graph and a traceability matrix
- **A deterministic ISO 26262 rule engine.** It runs 10 rules over real Jira issues and links: hazards mitigated, requirements implemented and verified, tests passed *on this release*, no suspect links, independent review for ASIL C/D, no open blocking defects, and ASIL consistency. Any blocking finding makes the release NO-GO. The demo release is 98% covered and still NO-GO, because in safety one hole is enough.
- **Live change-impact analysis.** Edit a hazard or requirement and every downstream test is flagged *suspect* through a Jira event trigger. It clears only by a re-run or by an impact review with a written justification.
- **Honest evidence.** CI and HIL benches post results to a web trigger. Manual results are labelled as attestations, and the demo's bench is labelled *simulated*. Nothing is ever silently faked, and new tests start as "Not run".
- **The Scrutineer Rovo agent** has 8 actions. It explains findings with the clause behind them, traces impact, drafts missing tests, links items and publishes evidence. Every write shows a draft and waits for an explicit yes.
- **An MCP server** (`rovo:mcp`) exposes the read-only tools, so any AI assistant can ask "is BBW 2.3 shippable?"
- **A Confluence evidence pack** in one click: verdict, matrix, every result's source, suspect-link history, sign-off table, and a SHA-256 fingerprint of the evaluated snapshot.
- **Sign-off and a release guard.** Named roles sign off a GO snapshot. A Jira workflow validator blocks closing a release-gate issue while the release is NO-GO.
- **A one-click demo.** A realistic brake-by-wire ECU program with four planted problems, plus decoys that prove the engine doesn't guess.

## How we built it

- **Forge app** in TypeScript on the Node 24 runtime. One React Custom UI serves three modules: `jira:projectPage`, `jira:issuePanel` and `jira:adminPage`.
- **A pure rule engine** with no Forge imports, developed test-first: 112 unit tests across the engine, mapping, impact analysis, ingestion, the demo dataset, the evidence renderer and the UI.
- **Real Jira data model:**
  - Trace items are ordinary issues with a `scrutineer` issue property.
  - Trace links are real Jira issue links.
  - Executions and suspect flags are issue properties on the test case; sign-offs and evidence records are project properties. Every surface reads the same evidence, whichever Forge installation context runs it. Forge KVS keeps only the ingest token, caches and immutable evidence snapshots.
- **Forge modules:** a `trigger` on `avi:jira:updated:issue` for change impact, a `webtrigger` for CI ingestion (timing-safe token check), a `jira:workflowValidator`, an async `consumer` for the demo loader, a `rovo:agent` with 8 `action` modules, and `rovo:mcp`.
- **Zero cost, and data stays on Atlassian:** no external calls and no paid LLM API. All generative AI goes through Rovo, and every AI capability also has a deterministic button.

## Challenges we ran into

- Keeping AI out of the verdict while keeping it useful. We made the gate fully deterministic and gave Rovo the jobs it is good at: explaining, drafting and navigating.
- Modelling suspect links correctly. A newer upstream change must re-flag a test even after an earlier re-run cleared an older change.
- Making the demo honest. A drafted test must not turn the gate green by itself, so we built an evidence model with source labels and a simulated bench that uses the real CI code path.

## Accomplishments that we're proud of

- The "lights out" moment is earned. Every finding cites real issues, and the decoys prove there are no false positives.
- A tamper-evident evidence pack an auditor could actually read.
- One core engine behind four surfaces: UI, Rovo, MCP and the workflow guard.

## What we learned

Functional safety is a traceability problem first and a documentation problem second. Once the trace graph lives where the work happens, the evidence writes itself.

## What's next for Scrutineer

- More profiles: IEC 62304 (medical devices) and DO-178C (aviation). Rules are data, so a profile is a configuration.
- Teamwork Graph suggestions for likely-but-unlinked evidence.
- Bitbucket pull requests in the trace.
- Readiness trends across releases.

## Built with

Atlassian Forge, Jira, Confluence, Rovo agents, Rovo MCP, Forge KVS, Forge events, TypeScript, React, Vite, Vitest

---

## Bonus write-ups

**Best Agents (Rovo).** The `rovo:agent` "Scrutineer" has 8 Forge `action` modules: 5 GET (readiness, findings, explain, trace impact, draft test) and 3 CREATE (create linked test, link issues, publish evidence pack). The agent's instructions require it to show the exact draft and wait for an explicit "yes" before any CREATE action. It cites issues as role and key, refuses to claim certification, and never claims a test passed. Every action is backed by the same deterministic engine as the UI, so the agent's answers always match the Control Room.

**Best app with Atlassian MCP.** The `rovo:mcp` module exposes 4 read-only tools: `get-release-readiness`, `list-findings`, `explain-finding` and `trace-impact`. Write tools are deliberately left out of MCP, so external agents can't change safety evidence without the human-confirmed Rovo or UI flow. `skill.md` in the repository tells external agents how to use the tools. The video shows MCP Inspector asking whether BBW 2.3 is shippable.

**Best Marketplace published app.** *(Fill in the listing or review-ticket link if submitted.)*
