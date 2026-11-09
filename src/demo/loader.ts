// Loads the Brake-by-Wire demo program into a Jira site (+ Confluence space). Runs in the async consumer.
import api, { route } from '@forge/api';
import { badge, type Execution, type LinkRole, type SuspectFlag } from '../engine/types';
import { ensureSpace, createPage, findPageByTitle, pageUrl } from '../confluence/client';
import {
  addRemoteLink, adfText, createIssues, createLink, createLinkType, createProject, createVersion, deleteIssue, getProject,
  getServerInfo, listLinkTypes, listVersions, searchIssues, setIssueProperty, transitionToDone, updateVersion,
} from '../jira/client';
import { LINK_TYPES, type ScrutineerProperty } from '../jira/map';
import { addExecutions, clearDemoComplete, deleteProjectState, getDemoComplete, getSettings, putDemoStatus, putSuspects, saveSettings, setDemoComplete, type DemoStatus } from '../store/kvs';
import { existingDataDecision } from './policy';
import { DEMO, DEMO_REVIEWERS } from './dataset';

export const DEMO_LABEL = 'scrutineer-demo';
export const EVIDENCE_SPACE = 'BBWSAFE';

export interface LoadOptions { accountId: string; projectKey?: string }

const TYPE_PREFS: Record<string, string[]> = { IMP: ['Story', 'Task'], DEF: ['Bug', 'Task'], default: ['Task'] };

async function projectIssueTypes(projectKey: string): Promise<string[]> {
  const res = await api.asApp().requestJira(route`/rest/api/3/project/${projectKey}?expand=issueTypes`, { headers: { Accept: 'application/json' } });
  const p = (await res.json()) as { issueTypes?: { name: string; subtask: boolean }[] };
  return (p.issueTypes ?? []).filter((t) => !t.subtask).map((t) => t.name);
}

export async function loadDemo(opts: LoadOptions): Promise<DemoStatus> {
  const status: DemoStatus = { state: 'running', steps: [], at: new Date().toISOString() };
  const step = async (name: string, fn: () => Promise<string | void>, fatal = true) => {
    try {
      const detail = await fn();
      status.steps.push({ name, ok: true, ...(detail ? { detail } : {}) });
    } catch (e) {
      status.steps.push({ name, ok: false, detail: (e as Error).message.slice(0, 300) });
      if (fatal) throw e;
    } finally {
      status.at = new Date().toISOString();
      await putDemoStatus(status);
    }
  };
  await putDemoStatus(status);

  let projectKey = opts.projectKey ?? DEMO.project.key;
  let projectId = '';
  const keyOf: Record<string, string> = {};
  try {
    await step('Project', async () => {
      const existing = await getProject(projectKey);
      if (existing) { projectId = existing.id; return `Using existing project ${projectKey}`; }
      const created = await createProject({ key: projectKey, name: DEMO.project.name, leadAccountId: opts.accountId,
        description: 'Scrutineer demo: brake-by-wire ECU safety program (ISO 26262).' });
      projectId = String(created.id);
      return `Created project ${projectKey}`;
    });
    status.projectKey = projectKey;

    const already = await searchIssues(`project = "${projectKey}" AND labels = "${DEMO_LABEL}"`);
    const complete = (await getDemoComplete())?.projectKey === projectKey;
    const decision = existingDataDecision(complete, already.length);
    if (decision === 'exists') {
      status.state = 'exists';
      status.steps.push({ name: 'Demo data', ok: true, detail: `Already loaded (${already.length} issues). Use Reset demo to start over.` });
      await saveSettings({ defaultProject: projectKey, demoProject: projectKey });
      await putDemoStatus(status);
      return status;
    }
    if (decision === 'incomplete') {
      status.state = 'failed';
      status.steps.push({ name: 'Demo data', ok: false, detail: `A previous load did not finish (${already.length} demo issues exist). Reset the demo, then load it again.` });
      await saveSettings({ demoProject: projectKey });
      await putDemoStatus(status);
      return status;
    }

    await step('Link types', async () => {
      const have = new Set((await listLinkTypes()).map((t) => t.name));
      const made: string[] = [];
      for (const r of Object.keys(LINK_TYPES) as LinkRole[]) {
        const t = LINK_TYPES[r];
        if (!have.has(t.name)) { await createLinkType(t); made.push(t.name); }
      }
      return made.length ? `Created ${made.join(', ')}` : 'All present';
    });

    await step('Releases', async () => {
      const have = new Set((await listVersions(projectKey)).map((v) => v.name));
      for (const v of DEMO.versions) if (!have.has(v)) await createVersion(projectId, v, false, v === 'BBW 2.3' ? 'Redundant actuator path and 2oo2 wheel-speed sensing' : 'Baseline brake-by-wire release');
      return DEMO.versions.join(', ');
    });

    await step('Issues', async () => {
      const types = await projectIssueTypes(projectKey);
      const pick = (role: string) => (TYPE_PREFS[role] ?? TYPE_PREFS.default).find((t) => types.includes(t)) ?? types[0];
      const created = await createIssues(DEMO.issues.map((d) => ({
        fields: {
          project: { key: projectKey },
          issuetype: { name: pick(d.role) },
          summary: d.summary,
          description: adfText(d.description),
          labels: [DEMO_LABEL, `scrutineer-${d.role.toLowerCase()}`],
          fixVersions: d.fixVersions.map((name) => ({ name })),
          ...(d.assignToLoader ? { assignee: { accountId: opts.accountId } } : {}),
        },
      })));
      DEMO.issues.forEach((d, i) => { keyOf[d.ref] = created[i].key; });
      return `${created.length} issues`;
    });

    await step('Scrutineer properties', async () => {
      for (const d of DEMO.issues) {
        const p: ScrutineerProperty = { role: d.role, demo: true };
        if (d.asil) p.asil = d.asil;
        if (d.superseded) p.superseded = true;
        if (d.severity) p.severity = d.severity;
        if (d.reviewer === '$ASSIGNEE') p.reviewerId = opts.accountId;
        else if (d.reviewer) { p.reviewerId = d.reviewer; p.reviewerName = DEMO_REVIEWERS[d.reviewer]; }
        await setIssueProperty(keyOf[d.ref], p);
      }
    });

    await step('Trace links', async () => {
      for (const l of DEMO.links) await createLink(l.role, keyOf[l.from], keyOf[l.to]);
      return `${DEMO.links.length} links`;
    });

    await step('Workflow status', async () => {
      let n = 0;
      for (const d of DEMO.issues) if (d.status === 'done') { await transitionToDone(keyOf[d.ref]); n++; }
      return `${n} issues moved to done`;
    }, false);

    await step('Release BBW 2.2', async () => {
      for (const v of await listVersions(projectKey)) if (DEMO.releasedVersions.includes(v.name) && !v.released) await updateVersion(v.id, { released: true, releaseDate: '2026-10-10' });
    }, false);

    await step('Test history', async () => {
      const list: { testKey: string; exec: Execution }[] = DEMO.executions.map((e) => ({ testKey: keyOf[e.ref], exec: e.exec }));
      await addExecutions(list);
      for (const s of DEMO.suspects) {
        const up = DEMO.issues.find((i) => i.ref === s.upstreamRef)!;
        const flag: SuspectFlag = { testKey: keyOf[s.testRef], upstreamKey: keyOf[s.upstreamRef], changedAt: s.changedAt, changedBy: s.changedBy,
          reason: `upstream ${badge({ role: up.role, key: keyOf[s.upstreamRef] })} changed (description)` };
        await putSuspects(keyOf[s.testRef], [flag]);
      }
      return `${list.length} executions, ${DEMO.suspects.length} suspect flag`;
    });

    await step('Confluence space and specs', async () => {
      const base = (await getServerInfo()).baseUrl;
      const space = await ensureSpace(EVIDENCE_SPACE, 'BBW Functional Safety', 'Safety case and evidence packs for the brake-by-wire ECU.');
      for (const p of DEMO.pages) {
        const page = (await findPageByTitle(space.id, p.title)) ?? (await createPage(space.id, p.title, p.body));
        for (const ref of p.linkTo) await addRemoteLink(keyOf[ref], pageUrl(base, page), p.title);
      }
      await saveSettings({ evidenceSpaceKey: EVIDENCE_SPACE });
      return `Space ${EVIDENCE_SPACE}, ${DEMO.pages.length} pages`;
    }, false);

    await saveSettings({ defaultProject: projectKey, demoProject: projectKey });
    await setDemoComplete(projectKey);
    status.state = status.steps.every((s) => s.ok) ? 'created' : 'partial';
  } catch {
    status.state = 'failed';
  }
  status.at = new Date().toISOString();
  await putDemoStatus(status);
  return status;
}

export async function resetDemo(): Promise<DemoStatus> {
  const settings = await getSettings();
  const projectKey = settings.demoProject ?? DEMO.project.key;
  const issues = await searchIssues(`project = "${projectKey}" AND labels = "${DEMO_LABEL}"`);
  for (const i of issues) await deleteIssue(i.key);
  const n = await deleteProjectState(projectKey);
  await clearDemoComplete();
  const status: DemoStatus = { state: 'reset', projectKey, at: new Date().toISOString(),
    steps: [{ name: 'Reset', ok: true, detail: `Deleted ${issues.length} issues and ${n} stored records` }] };
  await putDemoStatus(status);
  return status;
}
