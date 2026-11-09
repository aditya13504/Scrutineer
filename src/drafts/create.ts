import { badge, type TraceItem } from '../engine/types';
import { adfText, createIssue, createLink, setIssueProperty } from '../jira/client';
import { draftToDescription, type TestDraft } from './testDraft';

/** Creates a Test Case issue from an approved draft and links it "verifies" the requirement. */
export async function createLinkedTest(projectKey: string, req: TraceItem, draft: TestDraft, release: string, demo: boolean, who: 'app' | 'user' = 'user'): Promise<string> {
  const created = await createIssue({
    project: { key: projectKey },
    issuetype: { name: 'Task' },
    summary: draft.summary,
    description: adfText(draftToDescription(draft, badge(req))),
    labels: ['scrutineer-tc', ...(demo ? ['scrutineer-demo'] : [])],
    fixVersions: [{ name: release }],
  }, who);
  await setIssueProperty(created.key, { role: 'TC', ...(demo ? { demo: true } : {}) }, who);
  await createLink('verifies', created.key, req.key, who);
  return created.key;
}
