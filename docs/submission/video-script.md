# Demo video script: Scrutineer (target 2:55, hard limit under 5:00)

**Setup before recording:**
- Fresh demo load: Jira settings → Apps → Scrutineer → Reset demo (if needed), then Load demo project.
- Browser at 1440×900, Jira light theme, notifications off.
- Have two tabs ready: the BBW Control Room and Rovo chat with the Scrutineer agent selected.
- Have MCP Inspector open and connected to `https://mcp.atlassian.com/forge/<appId>`.
- Use no music, or royalty-free only. Show no third-party logos.

Keys below assume a fresh `BBW` project:

| Issue | Key |
|---|---|
| REQ pedal plausibility | BBW-27 |
| REQ wheel-speed cross-check | BBW-30 |
| TC wheel-speed | BBW-58 |
| IMP redundant actuator path | BBW-46 |
| DEF CAN timeout | BBW-71 |

If your keys differ, read them off the Findings tab.

| Time | On screen | Voice-over |
|---|---|---|
| 0:00–0:15 | Title card "Scrutineer: no release leaves the garage unverified" over the dark gantry with five red lights | "Before a race car can race, it must pass scrutineering. Before brake software can ship, every hazard must trace to a test that passed on that release. Most teams prove that in spreadsheets, by hand, every release." |
| 0:15–0:35 | BBW → Apps → Scrutineer. Release BBW 2.3. Gantry shows 3 red lights and NO-GO. Pause on readiness 98/100. | "Scrutineer lives in Jira. This is release 2.3 of a brake-by-wire ECU. Ninety-eight percent covered, and still NO-GO, because in safety one missing link is enough. Every finding comes from real Jira issues and links, checked by deterministic ISO 26262 rules. No AI guessing." |
| 0:35–0:45 | Click the Trace graph tab. Hover the red dashed "No verifying test" ghost node and the amber suspect edge. | "Hazards, requirements, implementation, tests. Red is a missing link. Amber is a test made stale by a change." |
| 0:45–1:10 | Switch to Rovo. Type "Why is the release gate red?" The agent lists 4 findings with keys. Type "Draft the missing test case". The agent shows the draft and asks "Shall I create it?". Type "Yes". The agent reports TC BBW-72 created and "Not run". | "The Scrutineer agent in Rovo explains each finding and the clause behind it. It drafts the missing test, and it only creates it after I say yes. A new test starts as Not run. Scrutineer never fakes evidence." |
| 1:10–1:20 | Back to the Control Room, Refresh. The finding changed to "TC BBW-72 has not been executed on BBW 2.3". Click "Run on bench (simulated)", then confirm. | "Results come from CI through a web trigger. In this demo, a clearly labelled simulated HIL bench uses the same path." |
| 1:20–1:35 | Open BBW-30 in a new tab and edit one word of the description. Back on the Control Room, after Refresh, TC BBW-58 shows a comment "⚠ Suspect: upstream REQ BBW-30 changed…". (Pre-record this if trigger latency is high.) | "Change a requirement, and every test downstream is flagged suspect automatically. That's ISO 26262 change-impact analysis, live." |
| 1:35–1:50 | The suspect finding: click "Record impact review", type the justification, confirm. Fast cut: "Close defect" on DEF BBW-71, then "Assign reviewer" Priya on IMP BBW-46. | "Re-run it, or record an impact review with a written justification. Close the verified defect. Assign an independent reviewer for ASIL D work." |
| 1:50–2:05 | **The moment.** Refresh. The five lights come on, go out one by one, and GO appears. | (silence for 2 seconds) "Lights out." |
| 2:05–2:25 | Evidence tab: sign off as Safety Manager. Click Publish evidence pack, then confirm. Open the Confluence page: verdict panel, matrix, suspect history with the justification, sign-off, SHA-256 fingerprint. | "One click, and the evidence pack is in Confluence: the matrix, every result's source, the impact review, the sign-off, and a fingerprint that proves the page matches the evidence." |
| 2:25–2:40 | MCP Inspector: call `get-release-readiness` with `{ "release": "BBW 2.3" }`. JSON shows `"verdict": "GO"`. | "And because it's an MCP server, any AI assistant can ask Scrutineer whether a release is shippable." |
| 2:40–2:55 | Closing card: "Weeks of spreadsheet audits → minutes. Built on Forge. Data never leaves Atlassian. Rovo agent + MCP + Jira + Confluence." | "Scrutineer. Built on Forge, with all data kept in Atlassian. No release leaves the garage unverified." |

**Optional deep dive (2:55–4:30), for judges who keep watching:**
- **The issue panel:** role and ASIL editing, execution history with source labels.
- **The decoy test:** its title mentions pedal plausibility, but it verifies a different requirement, and it is not counted. The superseded requirement is excluded from scope.
- **The CI curl example** in the admin page, returning `207` for a bad key.
- **Architecture slide:** pure rule engine (89 unit tests), Forge KVS, trigger, web trigger, workflow validator, `rovo:agent`, `rovo:mcp`.
- **Workflow guard:** trying to close a `release-gate` issue while NO-GO shows the blocking message.
