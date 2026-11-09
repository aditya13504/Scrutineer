import { describe, it, expect } from 'vitest';
import { vi } from 'vitest';
vi.mock('@forge/bridge', () => ({ invoke: vi.fn(), router: { open: vi.fn() }, view: {} }));
import { render, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { Dialog } from './ui';

function Harness() {
  const [note, setNote] = useState('');
  // Inline onClose: a new function on every render, as real callers pass it.
  return (
    <Dialog title="Record" onClose={() => undefined} footer={<button className="btn primary">Save</button>}>
      <select aria-label="Release"><option>BBW 2.3</option></select>
      <input aria-label="Note" type="text" value={note} onChange={(e) => setNote(e.target.value)} />
    </Dialog>
  );
}

describe('Dialog (review I5)', () => {
  it('keeps focus in the field being typed in when the parent re-renders', () => {
    const { getByLabelText } = render(<Harness />);
    const note = getByLabelText('Note') as HTMLInputElement;
    note.focus();
    fireEvent.change(note, { target: { value: 'a' } });
    fireEvent.change(note, { target: { value: 'ab' } });
    expect(document.activeElement).toBe(note);
    expect(note.value).toBe('ab');
  });
});
