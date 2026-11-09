import { describe, it, expect, vi } from 'vitest';
import { mkSnap } from './engine/fixtures';

const saved = vi.hoisted(() => ({ evsnap: [] as { id: string; value: { hash: string } }[], evidence: [] as { snapshotId: string; hash: string }[], page: '' }));

vi.mock('../src/snapshot/build', () => ({ buildSnapshot: async () => mkSnap() }));
vi.mock('../src/store/kvs', () => ({
  getSignoffs: async () => [],
  putEvidenceSnapshot: async (id: string, value: { hash: string }) => { saved.evsnap.push({ id, value }); },
  addEvidence: async (_p: string, _r: string, e: { snapshotId: string; hash: string }) => { saved.evidence.push(e); },
}));
vi.mock('../src/confluence/client', () => ({
  ensureSpace: async () => ({ id: '1', key: 'S', name: 'S' }),
  createPage: async (_s: string, _t: string, storage: string) => { saved.page = storage; return { id: '9', title: 't', _links: { webui: '/x' } }; },
  pageUrl: () => 'https://site/wiki/x',
}));
vi.mock('../src/jira/client', () => ({ getServerInfo: async () => ({ baseUrl: 'https://site' }) }));

import { publishEvidencePack } from '../src/evidence/publish';

describe('publishEvidencePack (review I2)', () => {
  it('stores the evaluated snapshot under an immutable id that the page and record cite', async () => {
    const rec = await publishEvidencePack('BBW', 'BBW 2.3', 'S', 'Ann');
    expect(saved.evsnap).toHaveLength(1);
    const { id, value } = saved.evsnap[0];
    expect(id).toBe(rec.snapshotId);
    expect(id.startsWith('BBW:BBW 2.3:')).toBe(true);
    expect(value.hash).toBe(rec.hash);
    expect(saved.page).toContain(id);
    expect(saved.evidence[0].snapshotId).toBe(id);
  });
});
