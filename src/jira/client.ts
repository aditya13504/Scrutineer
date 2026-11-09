// Thin Jira REST client over @forge/api. Everything here runs inside Forge.
import api, { route } from '@forge/api';
import type { LinkRole } from '../engine/types';
import { LINK_TYPES, PROPERTY_KEY, type JiraIssue, type ScrutineerProperty } from './map';

type Who = 'app' | 'user';
const req = (who: Who) => (who === 'user' ? api.asUser() : api.asApp());

export class JiraError extends Error {
  constructor(public status: number, public body: string, public path: string) {
    super(`Jira ${status} on ${path}: ${body.slice(0, 300)}`);
  }
}

async function call<T>(who: Who, r: ReturnType<typeof route>, method = 'GET', body?: unknown): Promise<T> {
  const res = await req(who).requestJira(r, {
    method,
    headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) throw new JiraError(res.status, text, String(r));
  return (text ? JSON.parse(text) : undefined) as T;
}

export const SEARCH_FIELDS = ['summary', 'status', 'issuetype', 'fixVersions', 'assignee', 'updated', 'issuelinks', 'labels'];

export async function searchIssues(jql: string, who: Who = 'app'): Promise<JiraIssue[]> {
  const out: JiraIssue[] = [];
  let nextPageToken: string | undefined;
  for (let page = 0; page < 50; page++) {
    const res = await call<{ issues: JiraIssue[]; nextPageToken?: string; isLast?: boolean }>(who, route`/rest/api/3/search/jql`, 'POST', {
      jql, fields: SEARCH_FIELDS, properties: [PROPERTY_KEY], maxResults: 100, ...(nextPageToken ? { nextPageToken } : {}),
    });
    out.push(...res.issues);
    if (!res.nextPageToken || res.isLast) break;
    nextPageToken = res.nextPageToken;
  }
  return out;
}

export const searchProjectIssues = (projectKey: string) => searchIssues(`project = "${projectKey.replace(/"/g, '')}" ORDER BY key ASC`);

export async function getIssue(key: string, who: Who = 'app'): Promise<JiraIssue> {
  return call<JiraIssue>(who, route`/rest/api/3/issue/${key}?fields=${SEARCH_FIELDS.join(',')}&properties=${PROPERTY_KEY}`);
}

export interface JiraVersion { id: string; name: string; released: boolean; archived?: boolean; releaseDate?: string }
export const listVersions = (projectKey: string) => call<JiraVersion[]>('app', route`/rest/api/3/project/${projectKey}/versions`);
export const createVersion = (projectId: string, name: string, released: boolean, description?: string) =>
  call<JiraVersion>('app', route`/rest/api/3/version`, 'POST', { name, projectId: Number(projectId), released, description });
export const updateVersion = (id: string, data: Partial<JiraVersion>) => call<JiraVersion>('app', route`/rest/api/3/version/${id}`, 'PUT', data);

export async function getIssueProperty(key: string): Promise<ScrutineerProperty> {
  try {
    const r = await call<{ value: ScrutineerProperty }>('app', route`/rest/api/3/issue/${key}/properties/${PROPERTY_KEY}`);
    return r?.value ?? {};
  } catch (e) {
    if (e instanceof JiraError && e.status === 404) return {};
    throw e;
  }
}
export const setIssueProperty = (key: string, value: ScrutineerProperty, who: Who = 'app') =>
  call<void>(who, route`/rest/api/3/issue/${key}/properties/${PROPERTY_KEY}`, 'PUT', value);

export async function patchIssueProperty(key: string, patch: Partial<ScrutineerProperty>, who: Who = 'app'): Promise<ScrutineerProperty> {
  const cur = await getIssueProperty(key);
  const next = { ...cur, ...patch };
  await setIssueProperty(key, next, who);
  return next;
}

export interface CreatedIssue { id: string; key: string }
export async function createIssues(issueUpdates: { fields: Record<string, unknown> }[], who: Who = 'app'): Promise<CreatedIssue[]> {
  const out: CreatedIssue[] = [];
  for (let i = 0; i < issueUpdates.length; i += 50) {
    const res = await call<{ issues: CreatedIssue[]; errors: unknown[] }>(who, route`/rest/api/3/issue/bulk`, 'POST', { issueUpdates: issueUpdates.slice(i, i + 50) });
    if (res.errors?.length && res.issues.length < issueUpdates.slice(i, i + 50).length) throw new Error(`Bulk create errors: ${JSON.stringify(res.errors).slice(0, 400)}`);
    out.push(...res.issues);
  }
  return out;
}
export const createIssue = async (fields: Record<string, unknown>, who: Who = 'app') =>
  call<CreatedIssue>(who, route`/rest/api/3/issue`, 'POST', { fields });
export const deleteIssue = (key: string) => call<void>('app', route`/rest/api/3/issue/${key}?deleteSubtasks=true`, 'DELETE');

/**
 * Creates "from <role> to", e.g. createLink('verifies', TC, REQ) → "TC verifies REQ".
 * Jira gives the link's outward description to inwardIssue, so `from` goes in inwardIssue.
 * (Verified live in Task 11; flip here if the Jira UI shows the reverse.)
 */
export const createLink = (role: LinkRole, fromKey: string, toKey: string, who: Who = 'app') =>
  call<void>(who, route`/rest/api/3/issueLink`, 'POST', { type: { name: LINK_TYPES[role].name }, inwardIssue: { key: fromKey }, outwardIssue: { key: toKey } });

export interface JiraLinkType { id: string; name: string; inward: string; outward: string }
export const listLinkTypes = async () => (await call<{ issueLinkTypes: JiraLinkType[] }>('app', route`/rest/api/3/issueLinkType`)).issueLinkTypes;
export const createLinkType = (t: { name: string; inward: string; outward: string }) => call<JiraLinkType>('app', route`/rest/api/3/issueLinkType`, 'POST', t);

export function adfText(text: string) {
  return { type: 'doc', version: 1, content: text.split('\n\n').map((p) => ({ type: 'paragraph', content: p ? [{ type: 'text', text: p }] : [] })) };
}
export const addComment = (key: string, text: string, who: Who = 'app') =>
  call<void>(who, route`/rest/api/3/issue/${key}/comment`, 'POST', { body: adfText(text) });

export interface JiraUser { accountId: string; displayName: string; accountType?: string; active?: boolean }
export const getMyself = (who: Who = 'user') => call<JiraUser>(who, route`/rest/api/3/myself`);
export const getUser = (accountId: string) => call<JiraUser>('app', route`/rest/api/3/user?accountId=${accountId}`);
export const searchUsers = async (query: string) =>
  (await call<JiraUser[]>('app', route`/rest/api/3/user/search?query=${query}&maxResults=20`)).filter((u) => u.accountType === 'atlassian' && u.active !== false);
export const assignableUsers = async (projectKey: string) =>
  (await call<JiraUser[]>('app', route`/rest/api/3/user/assignable/search?project=${projectKey}&maxResults=50`)).filter((u) => u.accountType === 'atlassian');

export interface JiraTransition { id: string; name: string; to: { statusCategory: { key: string }; name: string } }
export const getTransitions = async (key: string) => (await call<{ transitions: JiraTransition[] }>('app', route`/rest/api/3/issue/${key}/transitions`)).transitions;
export const doTransition = (key: string, id: string, who: Who = 'app') => call<void>(who, route`/rest/api/3/issue/${key}/transitions`, 'POST', { transition: { id } });

export async function transitionToDone(key: string, who: Who = 'app'): Promise<string> {
  const t = (await getTransitions(key)).find((x) => x.to.statusCategory.key === 'done');
  if (!t) throw new Error(`No transition to a done status is available for ${key}.`);
  await doTransition(key, t.id, who);
  return t.to.name;
}

export const editIssue = (key: string, fields: Record<string, unknown>, who: Who = 'app') =>
  call<void>(who, route`/rest/api/3/issue/${key}`, 'PUT', { fields });

export interface JiraProject { id: string; key: string; name: string }
export async function getProject(key: string): Promise<JiraProject | null> {
  try { return await call<JiraProject>('app', route`/rest/api/3/project/${key}`); } catch (e) {
    if (e instanceof JiraError && e.status === 404) return null;
    throw e;
  }
}
export const createProject = (p: { key: string; name: string; leadAccountId: string; description?: string }) =>
  call<{ id: number; key: string }>('app', route`/rest/api/3/project`, 'POST', {
    key: p.key, name: p.name, leadAccountId: p.leadAccountId, description: p.description,
    projectTypeKey: 'software', projectTemplateKey: 'com.pyxis.greenhopper.jira:gh-simplified-kanban-classic', assigneeType: 'UNASSIGNED',
  });

export const addRemoteLink = (key: string, url: string, title: string) =>
  call<void>('app', route`/rest/api/3/issue/${key}/remotelink`, 'POST', { object: { url, title, icon: { url16x16: 'https://www.atlassian.com/favicon.ico', title: 'Confluence' } } });

export const getServerInfo = () => call<{ baseUrl: string }>('app', route`/rest/api/3/serverInfo`);
