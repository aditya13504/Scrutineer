# Scrutineer

**No release leaves the garage unverified.**

In motorsport, *scrutineering* is the technical inspection every car must pass before it may race. Scrutineer does the same for safety-critical software, inside Jira and Confluence.

Teams building software for cars (ISO 26262) can't ship until they prove an unbroken chain for every safety-relevant item:

```
Hazard → Safety requirement → Implementation → Verification test → Passing result on this release
```

Today most teams assemble that proof by hand in spreadsheets. Scrutineer computes it live from Jira, gives each release a go/no-go verdict backed by evidence, flags verification made stale by upstream changes, and publishes an evidence pack to Confluence that auditors can read. A Rovo agent explains gaps and drafts fixes, and nothing is written without your approval.

Built on Atlassian Forge for **Codegeist 2026** (Apps for Specialized Industries).

---

## What it does

| Feature | Where | What it does |
|---|---|---|
| **Control Room** | Jira project page | Shows a start-light gantry (lights go out on GO), the readiness score, coverage, findings with one-click fixes, an interactive trace graph and a traceability matrix. |
| **Release gate (rule engine)** | Backend | Runs 10 deterministic ISO 26262 checks against real Jira issues and links. No AI guessing, so there are no false positives. |
| **Change impact** | Jira event trigger | When a hazard, requirement or decision changes, its downstream tests are marked *suspect* and get a comment. A suspect clears by re-running the test or recording an impact review with a written justification. |
| **Trace panel** | Jira issue panel | Shows the role, ASIL, upstream and downstream links, execution history (with the source of each result), and suspect warnings. |
| **CI / HIL results** | Web trigger | Your pipeline posts JSON results, which are recorded as CI evidence. The demo uses a clearly labelled *simulated* bench through the same code path. |
| **Scrutineer agent** | Rovo | 8 actions: readiness, findings, explain, trace impact, draft test, create test, link issues, publish evidence. Write actions always show a draft and wait for an explicit yes. |
| **MCP tools** | `rovo:mcp` | The read-only tools (`get-release-readiness`, `list-findings`, `explain-finding`, `trace-impact`) are available to external AI assistants. See [skill.md](skill.md). |
| **Evidence pack** | Confluence | One click publishes the verdict, matrix, findings, suspect-link history, sign-off table and a **SHA-256 fingerprint** of the evaluated snapshot. |
| **Sign-off** | Control Room | Safety Manager, Test Lead and Release Manager sign off a GO release. Each sign-off is tied to the snapshot hash it approved. |
| **Release guard** | Jira workflow validator | Blocks closing an issue labelled `release-gate` while its release is NO-GO. |

### The rules (ISO 26262 profile)

| Rule | Check | Severity |
|---|---|---|
| R0 | The release has safety requirements in scope | Blocking |
| R1 | Every ASIL-rated hazard is mitigated by a requirement | Blocking |
| R2 | Every requirement traces up to a hazard or safety decision | Major |
| R3 | Every requirement is implemented, and the implementation is done | Blocking |
| R4 | Every requirement has a verifying test case | Blocking |
| R5 | Every verifying test passed **on this release** | Blocking |
| R6 | No suspect links (upstream changed after the test ran) | Blocking |
| R7 | ASIL C/D implementation has an independent reviewer | Major |
| R8 | No open defect blocks a safety requirement | Blocking |
| R9 | Requirement ASIL is consistent with its hazards (unless decomposed) | Minor |

Any blocking finding makes the release **NO-GO**. Only major or minor findings make it **AT RISK**. Otherwise it is **GO**.

---

## Try it in five minutes

1. Install the app on a site with Jira and Confluence (Rovo is optional).
2. Go to **Jira settings → Apps → Scrutineer** and click **Load demo project**. It takes about a minute and creates:
   - the `BBW` (Brake-by-Wire ECU) project with 6 hazards, 2 safety decisions and 21 safety requirements
   - implementation stories, 21 test cases with HIL results, and a defect
   - a Confluence space `BBWSAFE` with the specs
3. Open **BBW → Apps → Scrutineer**. Release `BBW 2.2` is GO. Release `BBW 2.3` is **NO-GO** with exactly four planted problems:
   - a pedal plausibility requirement with no test (R4)
   - a wheel-speed test made suspect by a requirement edit (R6)
   - an open CAN-timeout defect (R8)
   - an ASIL D story reviewed by its own author (R7)
4. Fix them from the Findings tab, or ask the Scrutineer agent in Rovo. Then watch the lights go out and publish the evidence pack.

The demo also contains **decoys** that must not be flagged: a test whose title mentions the untested requirement but verifies a different one, and a superseded requirement. They show that the engine doesn't guess.

---

## Send CI results

Go to **Jira settings → Apps → Scrutineer → CI and HIL bench results** to find the web trigger URL and token.

```bash
curl -X POST "$SCRUTINEER_URL" \
  -H "Content-Type: application/json" \
  -H "x-scrutineer-token: $SCRUTINEER_TOKEN" \
  -d '{"projectKey":"BBW","version":"BBW 2.3","runId":"1181","runUrl":"https://ci.example.com/hil/1181",
       "results":[{"testKey":"BBW-56","result":"passed"},{"testKey":"BBW-57","result":"failed"}]}'
```

The web trigger responds as follows:
- `200`: all results recorded
- `207`: some entries rejected (unknown test key or bad result), with the valid ones still recorded
- `422`: nothing recorded (every entry rejected, or an empty batch)
- `400`: malformed body
- `401`: bad token

---

## Architecture

```
manifest.yml
src/
  engine/       Pure rule engine: types, context, ISO 26262 rules, gate (fully unit-tested, no Forge imports)
  jira/         REST client + pure mapping from Jira issues/links to the trace model
  snapshot/     Builds a TraceSnapshot from Jira + KVS
  impact/       Upstream/downstream walks, suspect flagging, impact reviews
  ingest/       CI result parsing (pure) + recording
  drafts/       Rule-based test case drafts + creation
  evidence/     Confluence evidence pack renderer + SHA-256 + publishing
  demo/         Brake-by-wire dataset (pure) + loader (async queue consumer)
  handlers/     Forge entry points: resolver, Rovo actions, trigger, web trigger, validator, demo consumer
  service.ts    Orchestration shared by UI, Rovo, MCP and validator
static/app/     One React Custom UI app: Control Room, Issue panel, Admin (routes on module type)
prompts/        Rovo agent instructions
```

**Data:**
- Trace items are ordinary Jira issues with a `scrutineer` issue property (role, ASIL, reviewer).
- Trace links are real Jira issue links (`Scrutineer Mitigates`, `Scrutineer Implements`, `Scrutineer Verifies`, `Scrutineer Derived`, `Blocks`).
- Test executions, suspect flags, snapshots, evidence records and sign-offs live in Forge KVS.

**Zero cost, and data stays on Atlassian:**
- There are no external calls (no `permissions.external`). All data stays in Forge storage.
- The app doesn't use the Forge LLMs API. All generative AI goes through Rovo.
- Every agent capability also works without AI through the UI. The engine, change tracking, evidence pack and demo loader never depend on Rovo.

---

## Develop

```bash
npm install && npm --prefix static/app install
npm test                 # engine, mapping, impact, ingestion, demo, evidence, service (95 tests)
npm run test:ui          # UI component tests
npm run build:ui         # builds static/app/dist
forge login              # once, with an Atlassian API token
forge register scrutineer
forge deploy
forge install --product jira      # then again with --product confluence
```

The Forge CLI 15 needs Node 22.23.4+ or 24.22.1+.

---

*Scrutineer supports evidence gathering. It does not certify compliance.*
