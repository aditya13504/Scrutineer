import { describe, it, expect } from 'vitest';
import { authorizeAdmin, authorizeProject, ADMIN_RESOLVERS } from '../src/handlers/guards';

const deps = (admin: boolean, browse: boolean) => ({ isJiraAdmin: async () => admin, canBrowse: async () => browse });

describe('resolver guards (review I1)', () => {
  it('admin resolvers include the token, settings and demo operations', () => {
    expect([...ADMIN_RESOLVERS].sort()).toEqual(['getIngestInfo', 'loadDemo', 'resetDemo', 'saveSettings']);
  });

  it('allows admin resolvers from the admin page without a permission lookup', async () => {
    await expect(authorizeAdmin({ extension: { type: 'jira:adminPage' } }, deps(false, false))).resolves.toBeUndefined();
  });

  it('allows admin resolvers elsewhere only for Jira admins', async () => {
    await expect(authorizeAdmin({ extension: { type: 'jira:projectPage' } }, deps(true, true))).resolves.toBeUndefined();
    await expect(authorizeAdmin({ extension: { type: 'jira:issuePanel' } }, deps(false, true))).rejects.toThrow(/Jira administrator/);
  });

  it('rejects project access the user does not have', async () => {
    await expect(authorizeProject('BBW', deps(false, true))).resolves.toBe('BBW');
    await expect(authorizeProject('SECRET', deps(false, false))).rejects.toThrow(/do not have access to project SECRET/);
  });
});
