import type { Profile } from './types';
import { ISO26262 } from './iso26262';

export const PROFILES: Profile[] = [ISO26262];

export function getProfile(id: string): Profile {
  const p = PROFILES.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown profile: ${id}`);
  return p;
}
