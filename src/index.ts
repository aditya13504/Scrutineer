// Forge function entry points (referenced from manifest.yml as index.<export>).
export { handler } from './handlers/resolver';
export { onIssueUpdated } from './handlers/trigger';
export { onResultsIngest } from './handlers/webtrigger';
export { validateRelease } from './handlers/validator';
export { onDemoJob } from './handlers/demo';
export {
  getReleaseReadiness, listFindings, explainFindingAction, traceImpactAction, draftTestCaseAction,
  createLinkedTestAction, linkIssuesAction, publishEvidencePackAction,
} from './handlers/actions';
