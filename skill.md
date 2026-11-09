# Skill: Scrutineer release-readiness tools (MCP)

Use these tools when a user asks whether a safety-critical software release is ready to ship, why a release gate is red, or what a change to a hazard or requirement would affect. The data comes from an Atlassian site running the Scrutineer Forge app (ISO 26262 profile).

Endpoint: `https://mcp.atlassian.com/forge/<appId>`. A site admin must enable external MCP access for the app.

## Tools (all read-only)

| Tool | Inputs | Returns |
|---|---|---|
| `get-release-readiness` | `projectKey?`, `release?` (both optional; defaults to the configured project and its next unreleased version) | The verdict (`GO`, `AT_RISK`, `NO_GO`), readiness score 0–100, coverage stats, findings and a `summary` |
| `list-findings` | `projectKey?`, `release?` | Every open finding: `id` (e.g. `R4:BBW-27`), `ruleId`, `severity`, `message`, `keys` |
| `explain-finding` | `findingId` or `issueKey`, `projectKey?`, `release?` | The rule title, ISO 26262 clause, evidence issues and how to fix it |
| `trace-impact` | `issueKey` | Upstream and downstream items, plus the test cases that would become suspect if this issue changed |

## How to use them well

1. Call `get-release-readiness` first and report the verdict in one line.
2. List blocking findings before major and minor ones. Quote issue keys exactly as returned, with their role (for example `REQ BBW-27`).
3. For "why" questions, call `explain-finding` with the finding id.
4. For "what if I change X" questions, call `trace-impact`.
5. Never claim a release is certified or compliant. Scrutineer supports evidence gathering and does not certify compliance.
6. These tools cannot change anything. To fix findings, send the user to the Scrutineer Control Room in Jira or the Scrutineer agent in Rovo, which ask for confirmation before any write.

## Example

> **User:** Is BBW 2.3 shippable?
>
> **Assistant:** *(calls `get-release-readiness` with `{ "projectKey": "BBW", "release": "BBW 2.3" }`)*
>
> No. BBW 2.3 is NO-GO (readiness 98/100). Three blocking findings:
> - REQ BBW-27 has no verifying test case (R4).
> - TC BBW-58 is suspect: REQ BBW-30 changed after it last ran (R6).
> - DEF BBW-71 is open and blocks REQ BBW-29 (R8).
>
> There is also one major finding: IMP BBW-46 was reviewed by its own assignee (R7).
