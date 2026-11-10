// Change-impact analysis (ISO 26262-8 §8): which verification goes suspect when an upstream item changes.
import { compareKeys } from '../engine/context';
import { cleanLinks } from '../engine/context';
import { badge, type LinkRole, type SuspectFlag, type TraceSnapshot } from '../engine/types';

export const TRACE_FIELDS = ['summary', 'description', 'asil'];

function index(snap: TraceSnapshot) {
  const links = cleanLinks(snap);
  return {
    into: (key: string, role: LinkRole) => links.filter((l) => l.to === key && l.role === role).map((l) => l.from),
    outOf: (key: string, role: LinkRole) => links.filter((l) => l.from === key && l.role === role).map((l) => l.to),
  };
}

export function downstream(snap: TraceSnapshot, key: string): { items: string[]; tests: string[] } {
  const { into } = index(snap);
  const seen = new Set<string>();
  const queue = [key];
  while (queue.length) {
    const k = queue.shift()!;
    const role = snap.items[k]?.role;
    const next: string[] = [];
    if (role === 'HAZ') next.push(...into(k, 'mitigates'));
    if (role === 'REQ' || role === 'DEC') next.push(...into(k, 'derivedFrom'));
    if (role === 'REQ') next.push(...into(k, 'verifies'), ...into(k, 'implements'));
    for (const n of next) if (n !== key && !seen.has(n)) { seen.add(n); queue.push(n); }
  }
  const items = [...seen].sort(compareKeys);
  return { items, tests: items.filter((k) => snap.items[k]?.role === 'TC') };
}

export function upstream(snap: TraceSnapshot, key: string): string[] {
  const { outOf } = index(snap);
  const seen = new Set<string>();
  const queue = [key];
  while (queue.length) {
    const k = queue.shift()!;
    const role = snap.items[k]?.role;
    const next: string[] = [];
    if (role === 'TC') next.push(...outOf(k, 'verifies'));
    if (role === 'IMP') next.push(...outOf(k, 'implements'));
    if (role === 'DEF') next.push(...outOf(k, 'blocks'));
    if (role === 'REQ') next.push(...outOf(k, 'mitigates'), ...outOf(k, 'derivedFrom'));
    for (const n of next) if (n !== key && !seen.has(n)) { seen.add(n); queue.push(n); }
  }
  return [...seen].sort(compareKeys);
}

export function flagsForChange(snap: TraceSnapshot, changedKey: string, changedBy: string, changedAt: string, fields: string[]): SuspectFlag[] {
  const it = snap.items[changedKey];
  if (!it || !['HAZ', 'REQ', 'DEC'].includes(it.role)) return [];
  const relevant = fields.map((f) => f.toLowerCase()).filter((f) => TRACE_FIELDS.includes(f));
  if (!relevant.length) return [];
  const reason = `upstream ${badge(it)} changed (${[...new Set(relevant)].join(', ')})`;
  return downstream(snap, changedKey).tests.map((testKey) => ({ testKey, upstreamKey: changedKey, changedAt, changedBy, reason }));
}

/** Adds new flags; an unresolved flag for the same test/upstream pair is refreshed (newer change time) rather than duplicated. */
export function mergeFlags(existing: SuspectFlag[], incoming: SuspectFlag[]): { flags: SuspectFlag[]; added: number; refreshed: number } {
  const flags = existing.map((f) => ({ ...f }));
  let added = 0;
  let refreshed = 0;
  for (const n of incoming) {
    const open = flags.find((f) => f.testKey === n.testKey && f.upstreamKey === n.upstreamKey && !f.resolved);
    if (open) {
      if (n.changedAt > open.changedAt) { Object.assign(open, { changedAt: n.changedAt, changedBy: n.changedBy, reason: n.reason }); refreshed++; }
      continue;
    }
    flags.push(n);
    added++;
  }
  return { flags, added, refreshed };
}

export function resolveByReview(flags: SuspectFlag[], upstreamKey: string | undefined, actor: string, justification: string, at: string): SuspectFlag[] {
  if (!justification?.trim()) throw new Error('An impact review needs a written justification.');
  return flags.map((f) => (!f.resolved && (!upstreamKey || f.upstreamKey === upstreamKey)
    ? { ...f, resolved: { by: 'review' as const, at, actor, justification: justification.trim() } }
    : f));
}
