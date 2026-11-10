# Scrutineer privacy policy

*Last updated: 10 November 2026*

Scrutineer is an Atlassian Forge app. It runs on Atlassian's infrastructure and keeps all of its data inside the Atlassian site where it is installed.

## What Scrutineer stores

| Data | Where it is stored |
|---|---|
| Role, ASIL and reviewer of each trace item | A `scrutineer` property on the Jira issue |
| Test results (result, version, time, source, the name of whoever recorded them) and suspect flags | Properties on the Jira test case issue |
| Sign-offs (role, name, Atlassian account ID, time) and evidence pack records | Properties on the Jira project |
| Evidence packs | Pages in the Confluence space you choose |
| Settings, the CI ingest token, a readiness cache and evidence snapshots | Forge storage for your site |

Some of these records contain Atlassian account IDs and display names, because a safety audit needs to show who recorded a result, reviewed a change or signed off a release.

## What Scrutineer does not do

- It makes no outbound network calls. No data leaves your Atlassian site.
- It does not use third-party analytics, advertising or tracking.
- It does not sell or share data with anyone.
- It does not use the Forge LLM API. AI features run through Atlassian Rovo, under Atlassian's own terms.

## Retention and deletion

Data stays on your site until you delete it. Deleting the issues, project properties or Confluence pages removes that data. Uninstalling the app removes its Forge storage, as described in Atlassian's Forge documentation.

## Contact

Open an issue at https://github.com/aditya13504/Scrutineer/issues.
