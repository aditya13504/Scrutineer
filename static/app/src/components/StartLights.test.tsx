import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { StartLights } from './StartLights';

describe('StartLights', () => {
  it('NO_GO with 5 lights renders five lit red lamps and the NO-GO label', () => {
    const { container, getByText } = render(<StartLights verdict="NO_GO" lights={5} />);
    expect(container.querySelectorAll('.lamp.lit.red')).toHaveLength(5);
    expect(getByText('NO-GO')).toBeTruthy();
  });

  it('NO_GO with 3 lights renders three lit lamps', () => {
    const { container } = render(<StartLights verdict="NO_GO" lights={3} />);
    expect(container.querySelectorAll('.lamp.lit')).toHaveLength(3);
  });

  it('AT_RISK renders five amber lamps', () => {
    const { container, getByText } = render(<StartLights verdict="AT_RISK" lights={5} />);
    expect(container.querySelectorAll('.lamp.lit.amber')).toHaveLength(5);
    expect(getByText('At risk')).toBeTruthy();
  });

  it('GO renders no lit lamps and the GO label', () => {
    const { container, getByText } = render(<StartLights verdict="GO" lights={0} />);
    expect(container.querySelectorAll('.lamp.lit')).toHaveLength(0);
    expect(getByText('GO')).toBeTruthy();
  });

  it('exposes the verdict to assistive tech', () => {
    const { getByRole } = render(<StartLights verdict="NO_GO" lights={2} />);
    expect(getByRole('img').getAttribute('aria-label')).toBe('Release gate: NO-GO, 2 of 5 lights on');
  });
});
