import { describe, it, expect } from 'vitest';
import { parseIngest, checkToken } from '../../src/ingest/ingest';

const NOW = '2026-11-09T12:00:00.000Z';
const known = new Set(['BBW-10', 'BBW-11']);
const body = (o: unknown) => JSON.stringify(o);

describe('parseIngest', () => {
  it('accepts a valid batch', () => {
    const r = parseIngest(body({ projectKey: 'BBW', version: 'BBW 2.3', runId: '481', runUrl: 'https://ci.example/481',
      results: [{ testKey: 'BBW-10', result: 'passed' }, { testKey: 'BBW-11', result: 'FAILED' }] }), known, 'CI (481)', NOW, 'ci');
    expect(r.error).toBeUndefined();
    expect(r.rejected).toEqual([]);
    expect(r.accepted).toEqual([
      { testKey: 'BBW-10', exec: { result: 'Passed', version: 'BBW 2.3', executedAt: NOW, source: 'ci', actor: 'CI (481)', reference: 'https://ci.example/481' } },
      { testKey: 'BBW-11', exec: { result: 'Failed', version: 'BBW 2.3', executedAt: NOW, source: 'ci', actor: 'CI (481)', reference: 'https://ci.example/481' } },
    ]);
  });

  it('rejects an unknown test key but keeps valid entries (Review Focus 5)', () => {
    const r = parseIngest(body({ version: 'BBW 2.3', results: [{ testKey: 'BBW-99', result: 'passed' }, { testKey: 'BBW-10', result: 'passed' }] }), known, 'CI', NOW, 'ci');
    expect(r.accepted.map((a) => a.testKey)).toEqual(['BBW-10']);
    expect(r.rejected).toEqual([{ index: 0, reason: 'Unknown test case BBW-99' }]);
  });

  it('rejects a bad result string', () => {
    const r = parseIngest(body({ version: 'BBW 2.3', results: [{ testKey: 'BBW-10', result: 'green' }] }), known, 'CI', NOW, 'ci');
    expect(r.accepted).toEqual([]);
    expect(r.rejected[0].reason).toMatch(/result must be passed or failed/);
  });

  it('invalid JSON → error', () => {
    expect(parseIngest('{nope', known, 'CI', NOW, 'ci').error).toMatch(/valid JSON/);
  });

  it('missing version or results → error', () => {
    expect(parseIngest(body({ results: [] }), known, 'CI', NOW, 'ci').error).toMatch(/version/);
    expect(parseIngest(body({ version: 'BBW 2.3' }), known, 'CI', NOW, 'ci').error).toMatch(/results/);
  });

  it('reference falls back to runId', () => {
    const r = parseIngest(body({ version: 'v', runId: '7', results: [{ testKey: 'BBW-10', result: 'passed' }] }), known, 'CI', NOW, 'ci');
    expect(r.accepted[0].exec.reference).toBe('7');
  });
});

describe('checkToken', () => {
  it('requires the exact token, case-insensitive header name', () => {
    expect(checkToken({ 'X-Scrutineer-Token': ['abc'] }, 'abc')).toBe(true);
    expect(checkToken({ 'x-scrutineer-token': ['abc'] }, 'abc')).toBe(true);
    expect(checkToken({ 'x-scrutineer-token': ['abd'] }, 'abc')).toBe(false);
    expect(checkToken({}, 'abc')).toBe(false);
    expect(checkToken({ 'x-scrutineer-token': [''] }, '')).toBe(false);
  });
});

import { ingestStatusCode } from '../../src/ingest/ingest';
describe('ingestStatusCode (review I4)', () => {
  it('422 when every entry is rejected, 207 when mixed, 200 when all accepted, 400 on error', () => {
    const acc = [{ testKey: 'A', exec: {} as never }];
    const rej = [{ index: 0, reason: 'x' }];
    expect(ingestStatusCode({ accepted: [], rejected: rej })).toBe(422);
    expect(ingestStatusCode({ accepted: acc, rejected: rej })).toBe(207);
    expect(ingestStatusCode({ accepted: acc, rejected: [] })).toBe(200);
    expect(ingestStatusCode({ accepted: [], rejected: [], error: 'bad' })).toBe(400);
    expect(ingestStatusCode({ accepted: [], rejected: [] })).toBe(422);
  });
});
