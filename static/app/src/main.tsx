import { createRoot } from 'react-dom/client';
import { view } from '@forge/bridge';
import './styles.css';
import { ControlRoom } from './views/ControlRoom';
import { IssuePanel } from './views/IssuePanel';
import { Admin } from './views/Admin';

interface ForgeContext { extension?: { type?: string; project?: { key: string }; issue?: { key: string } } }

async function boot() {
  try { await view.theme.enable(); } catch { /* theming is optional */ }
  const ctx = (await view.getContext()) as ForgeContext;
  const ext = ctx.extension ?? {};
  const root = createRoot(document.getElementById('root')!);
  if (ext.type === 'jira:issuePanel' && ext.issue) root.render(<IssuePanel issueKey={ext.issue.key} />);
  else if (ext.type === 'jira:adminPage') root.render(<Admin />);
  else root.render(<ControlRoom projectKey={ext.project?.key} />);
}

void boot();
