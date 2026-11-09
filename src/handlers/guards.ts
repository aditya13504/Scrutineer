// Authorization for Custom UI resolvers. One resolver function serves every module, so checks live here.

export const ADMIN_RESOLVERS = new Set(['saveSettings', 'getIngestInfo', 'loadDemo', 'resetDemo']);

export interface GuardCtx { extension?: { type?: string } }
export interface GuardDeps { isJiraAdmin: () => Promise<boolean>; canBrowse: (projectKey: string) => Promise<boolean> }

/** Admin operations: always allowed from the Jira admin page (Jira only shows it to admins), otherwise only for Jira admins. */
export async function authorizeAdmin(ctx: GuardCtx, deps: GuardDeps): Promise<void> {
  if (ctx.extension?.type === 'jira:adminPage') return;
  if (await deps.isJiraAdmin()) return;
  throw new Error('Only a Jira administrator can do this. Ask an admin to open Jira settings → Apps → Scrutineer.');
}

/** Project reads run as the app, so check that the calling user can browse the project first. */
export async function authorizeProject(projectKey: string, deps: GuardDeps): Promise<string> {
  if (!(await deps.canBrowse(projectKey))) throw new Error(`You do not have access to project ${projectKey}.`);
  return projectKey;
}
