import { useEffect, useRef, type ReactNode } from 'react';
import { openIssue } from '../api';
import type { Role } from '../types';

export function RoleBadge({ role, k, link = true }: { role?: Role; k: string; link?: boolean }) {
  const inner = (
    <span className="rb">
      {role && <span className={`role ${role}`}>{role}</span>}
      <span>{k}</span>
    </span>
  );
  return link ? <button type="button" className="linklike" onClick={() => openIssue(k)} title={`Open ${k}`}>{inner}</button> : inner;
}

export function Dialog({ title, children, onClose, footer }: { title: string; children: ReactNode; onClose: () => void; footer: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('textarea, input, select, button.primary')?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <header><h2>{title}</h2></header>
        <div className="body">{children}</div>
        <footer>{footer}</footer>
      </div>
    </div>
  );
}

export function Toast({ text, error, onDone }: { text: string; error?: boolean; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, error ? 9000 : 6000); return () => clearTimeout(t); }, [text, error, onDone]);
  return <div className={`toast ${error ? 'error' : ''}`} role="status">{text}</div>;
}

/** Renders text where "ROLE KEY-12" tokens become clickable role badges. */
export function BadgedText({ text }: { text: string }) {
  const parts = text.split(/\b(HAZ|REQ|IMP|TC|DEF|DEC) ([A-Z][A-Z0-9_]+-\d+)\b/g);
  const out: ReactNode[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (i % 3 === 0) { if (parts[i]) out.push(<span key={i}>{parts[i]}</span>); }
    else if (i % 3 === 1) { out.push(<RoleBadge key={i} role={parts[i] as Role} k={parts[i + 1]} />); i++; }
  }
  return <>{out}</>;
}
