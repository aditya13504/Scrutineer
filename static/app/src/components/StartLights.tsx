import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Verdict } from '../types';

const LABEL: Record<Verdict, string> = { GO: 'GO', AT_RISK: 'At risk', NO_GO: 'NO-GO' };

function reducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** Five-lamp start gantry. When a red gate turns GO, the lamps go out left to right, then "GO" appears. */
export function StartLights({ verdict, lights, children }: { verdict: Verdict; lights: number; children?: ReactNode }) {
  const target = Math.max(0, Math.min(5, lights));
  const [shown, setShown] = useState(target);
  const [colour, setColour] = useState<Verdict>(verdict);
  const [lightsOut, setLightsOut] = useState(false);
  const prev = useRef(verdict);

  useEffect(() => {
    const was = prev.current;
    prev.current = verdict;
    if (verdict === 'GO' && was !== 'GO' && shown > 0 && !reducedMotion()) {
      // Race-start sequence: all five on, then out one by one.
      setShown(5);
      setLightsOut(false);
      let n = 5;
      const t = setInterval(() => {
        n -= 1;
        setShown(n);
        if (n <= 0) { clearInterval(t); setColour('GO'); setLightsOut(true); }
      }, 180);
      return () => clearInterval(t);
    }
    setShown(target);
    setColour(verdict);
    setLightsOut(verdict === 'GO' && was !== 'GO');
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verdict, target]);

  const tone = colour === 'AT_RISK' ? 'amber' : 'red';
  return (
    <div className={`gantry ${colour === 'GO' ? 'is-go' : ''}`}>
      <div className="lamps" role="img" aria-label={`Release gate: ${LABEL[verdict]}, ${target} of 5 lights on`}>
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className={`lamp ${i < shown ? `lit ${tone}` : ''}`}>
            <span className="lens" />
            <span className="lens" />
          </span>
        ))}
      </div>
      <div className={`verdict ${colour === 'GO' ? 'go' : tone} ${lightsOut ? 'reveal' : ''}`} aria-live="polite">{LABEL[colour]}</div>
      {children && <div className="facts">{children}</div>}
    </div>
  );
}
