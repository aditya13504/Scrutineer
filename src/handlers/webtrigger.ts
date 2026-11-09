// Forge webtrigger: CI / HIL bench results ingestion. Authenticated by the x-scrutineer-token header.
import { checkToken, ingestStatusCode } from '../ingest/ingest';
import { ingestBody } from '../ingest/record';
import { getSettings } from '../store/kvs';

interface WebTriggerRequest { method: string; headers: Record<string, string[]>; body?: string }
interface WebTriggerResponse { statusCode: number; headers: Record<string, string[]>; body: string }

const json = (statusCode: number, data: unknown): WebTriggerResponse => ({
  statusCode, headers: { 'Content-Type': ['application/json'] }, body: JSON.stringify(data),
});

export async function onResultsIngest(request: WebTriggerRequest): Promise<WebTriggerResponse> {
  if (request.method !== 'POST') return json(405, { error: 'Use POST with a JSON body.' });
  const settings = await getSettings();
  if (!checkToken(request.headers ?? {}, settings.ingestToken)) return json(401, { error: 'Missing or invalid x-scrutineer-token header.' });
  try {
    const res = await ingestBody(request.body ?? '');
    if (res.error) return json(ingestStatusCode(res), { error: res.error });
    return json(ingestStatusCode(res), { accepted: res.accepted.length, rejected: res.rejected, projectKey: res.projectKey });
  } catch (e) {
    console.error('ingest failed', e);
    return json(500, { error: 'Ingestion failed. Check the app logs.' });
  }
}
