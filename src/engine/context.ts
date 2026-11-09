import type { Execution, LinkRole, RuleContext, TraceItem, TraceLink, TraceSnapshot } from './types';

/** Natural order for issue keys: BBW-2 before BBW-10. */
export function compareKeys(a: string, b: string): number {
  const ma = /^(.*?)(\d+)$/.exec(a);
  const mb = /^(.*?)(\d+)$/.exec(b);
  if (ma && mb && ma[1] === mb[1]) return Number(ma[2]) - Number(mb[2]);
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Removes self links, duplicates and links to unknown items. */
export function cleanLinks(snap: TraceSnapshot): TraceLink[] {
  const seen = new Set<string>();
  const out: TraceLink[] = [];
  for (const l of snap.links) {
    if (l.from === l.to || !snap.items[l.from] || !snap.items[l.to]) continue;
    const id = `${l.role}|${l.from}|${l.to}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(l);
  }
  return out;
}

export function buildContext(snap: TraceSnapshot): RuleContext {
  const links = cleanLinks(snap);
  const out = new Map<string, string[]>();
  const inc = new Map<string, string[]>();
  for (const l of links) {
    const ko = `${l.from}|${l.role}`;
    const ki = `${l.to}|${l.role}`;
    out.set(ko, [...(out.get(ko) ?? []), l.to]);
    inc.set(ki, [...(inc.get(ki) ?? []), l.from]);
  }
  const outgoing = (key: string, role: LinkRole) => [...(out.get(`${key}|${role}`) ?? [])].sort(compareKeys);
  const incoming = (key: string, role: LinkRole) => [...(inc.get(`${key}|${role}`) ?? [])].sort(compareKeys);

  const all = Object.values(snap.items).sort((a, b) => compareKeys(a.key, b.key));
  const scopeReqs = all.filter((i) => i.role === 'REQ' && !i.superseded && i.fixVersions.includes(snap.release));

  const hazardKeys = new Set<string>();
  for (const h of all) if (h.role === 'HAZ' && h.fixVersions.includes(snap.release)) hazardKeys.add(h.key);
  for (const r of scopeReqs) for (const h of outgoing(r.key, 'mitigates')) if (snap.items[h]?.role === 'HAZ') hazardKeys.add(h);
  const scopeHazards = all.filter((i) => hazardKeys.has(i.key));

  const testKeys = new Set<string>();
  for (const r of scopeReqs) for (const t of incoming(r.key, 'verifies')) if (snap.items[t]?.role === 'TC') testKeys.add(t);
  const scopeTests = all.filter((i) => testKeys.has(i.key));

  const latestExec = (testKey: string, version: string): Execution | undefined => {
    const list = (snap.executions[testKey] ?? []).filter((e) => e.version === version);
    return list.reduce<Execution | undefined>((best, e) => (!best || e.executedAt > best.executedAt ? e : best), undefined);
  };

  return { snap, scopeReqs, scopeHazards, scopeTests, outgoing, incoming, latestExec };
}

export function itemsOf(snap: TraceSnapshot, keys: string[]): TraceItem[] {
  return keys.map((k) => snap.items[k]).filter(Boolean);
}
