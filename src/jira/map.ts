// Pure mapping from Jira REST shapes to the Scrutineer trace model.
import { ROLES, type Asil, type LinkRole, type Role, type StatusCategory, type TraceItem, type TraceLink } from '../engine/types';

export const PROPERTY_KEY = 'scrutineer';

export interface ScrutineerProperty {
  role?: Role;
  asil?: Asil;
  reviewerId?: string;
  reviewerName?: string;
  superseded?: boolean;
  decomposed?: boolean;
  severity?: string;
  benchOutcome?: 'pass' | 'fail';
  demo?: boolean;
}

export interface JiraIssueLink {
  type: { name: string; inward?: string; outward?: string };
  outwardIssue?: { key: string };
  inwardIssue?: { key: string };
}

export interface JiraIssue {
  key: string;
  id?: string;
  properties?: Record<string, unknown>;
  fields: {
    summary: string;
    status?: { name: string; statusCategory?: { key: string } };
    issuetype?: { name: string };
    fixVersions?: { name: string }[];
    assignee?: { accountId: string; displayName?: string } | null;
    updated?: string;
    issuelinks?: JiraIssueLink[];
    labels?: string[];
  };
}

export const LINK_TYPES: Record<LinkRole, { name: string; outward: string; inward: string }> = {
  mitigates: { name: 'Scrutineer Mitigates', outward: 'mitigates', inward: 'is mitigated by' },
  implements: { name: 'Scrutineer Implements', outward: 'implements', inward: 'is implemented by' },
  verifies: { name: 'Scrutineer Verifies', outward: 'verifies', inward: 'is verified by' },
  derivedFrom: { name: 'Scrutineer Derived', outward: 'is derived from', inward: 'is source of' },
  blocks: { name: 'Blocks', outward: 'blocks', inward: 'is blocked by' },
};

export function linkRoleOf(typeName: string): LinkRole | undefined {
  return (Object.keys(LINK_TYPES) as LinkRole[]).find((r) => LINK_TYPES[r].name === typeName);
}

/** Jira returns "+0000" offsets; normalise to an ISO string. */
export function toIso(jiraDate: string | undefined): string {
  if (!jiraDate) return new Date(0).toISOString();
  const d = new Date(jiraDate.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  return isNaN(d.getTime()) ? new Date(0).toISOString() : d.toISOString();
}

const CATS: StatusCategory[] = ['new', 'indeterminate', 'done'];

export function readProperty(raw: JiraIssue): ScrutineerProperty {
  const p = raw.properties?.[PROPERTY_KEY];
  return p && typeof p === 'object' ? (p as ScrutineerProperty) : {};
}

export function mapIssue(raw: JiraIssue, roleFallback: Record<string, Role>): TraceItem | null {
  const prop = readProperty(raw);
  const typeName = raw.fields.issuetype?.name ?? '';
  const role = prop.role && ROLES.includes(prop.role) ? prop.role : prop.role ? undefined : roleFallback[typeName];
  if (!role) return null;
  const cat = raw.fields.status?.statusCategory?.key as StatusCategory | undefined;
  const item: TraceItem = {
    key: raw.key,
    role,
    summary: raw.fields.summary ?? '',
    status: raw.fields.status?.name ?? '',
    statusCategory: cat && CATS.includes(cat) ? cat : 'new',
    fixVersions: (raw.fields.fixVersions ?? []).map((v) => v.name),
    updatedAt: toIso(raw.fields.updated),
  };
  if (prop.asil) item.asil = prop.asil;
  if (raw.fields.assignee?.accountId) {
    item.assigneeId = raw.fields.assignee.accountId;
    if (raw.fields.assignee.displayName) item.assigneeName = raw.fields.assignee.displayName;
  }
  if (prop.reviewerId) item.reviewerId = prop.reviewerId;
  if (prop.reviewerName) item.reviewerName = prop.reviewerName;
  if (prop.superseded !== undefined) item.superseded = prop.superseded;
  if (prop.decomposed !== undefined) item.decomposed = prop.decomposed;
  if (prop.severity) item.severity = prop.severity;
  return item;
}

/** On issue X, an outward entry to Y of type N means "X <N.outward> Y". Inward entries mirror the other side and are skipped. */
export function mapLinks(raw: JiraIssue[]): TraceLink[] {
  const seen = new Set<string>();
  const out: TraceLink[] = [];
  for (const issue of raw) {
    for (const l of issue.fields.issuelinks ?? []) {
      if (!l.outwardIssue) continue;
      const role = linkRoleOf(l.type.name);
      if (!role) continue;
      const id = `${role}|${issue.key}|${l.outwardIssue.key}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ role, from: issue.key, to: l.outwardIssue.key });
    }
  }
  return out;
}
