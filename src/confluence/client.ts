import api, { route } from '@forge/api';

export class ConfluenceError extends Error {
  constructor(public status: number, public body: string, public path: string) {
    super(`Confluence ${status} on ${path}: ${body.slice(0, 300)}`);
  }
}

async function call<T>(r: ReturnType<typeof route>, method = 'GET', body?: unknown, who: 'app' | 'user' = 'app'): Promise<T> {
  const res = await (who === 'user' ? api.asUser() : api.asApp()).requestConfluence(r, {
    method,
    headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) throw new ConfluenceError(res.status, text, String(r));
  return (text ? JSON.parse(text) : undefined) as T;
}

export interface Space { id: string; key: string; name: string }

export async function getSpaceByKey(key: string): Promise<Space | null> {
  const r = await call<{ results: Space[] }>(route`/wiki/api/v2/spaces?keys=${key}`);
  return r.results?.[0] ?? null;
}

export async function ensureSpace(key: string, name: string, description: string): Promise<Space> {
  const existing = await getSpaceByKey(key);
  if (existing) return existing;
  try {
    return await call<Space>(route`/wiki/api/v2/spaces`, 'POST', { key, name, description: { value: description, representation: 'plain' } });
  } catch (e) {
    // Older sites: fall back to the v1 endpoint.
    await call<unknown>(route`/wiki/rest/api/space`, 'POST', { key, name, description: { plain: { value: description, representation: 'plain' } } });
    const s = await getSpaceByKey(key);
    if (!s) throw e;
    return s;
  }
}

export interface Page { id: string; title: string; _links?: { webui?: string; base?: string } }

export async function createPage(spaceId: string, title: string, storage: string, who: 'app' | 'user' = 'app'): Promise<Page> {
  return call<Page>(route`/wiki/api/v2/pages`, 'POST', { spaceId, status: 'current', title, body: { representation: 'storage', value: storage } }, who);
}

export async function findPageByTitle(spaceId: string, title: string): Promise<Page | null> {
  const r = await call<{ results: Page[] }>(route`/wiki/api/v2/spaces/${spaceId}/pages?title=${title}&limit=1`);
  return r.results?.[0] ?? null;
}

export function pageUrl(siteBase: string, p: Page): string {
  const web = p._links?.webui ?? `/pages/${p.id}`;
  return `${siteBase.replace(/\/$/, '')}/wiki${web}`;
}
