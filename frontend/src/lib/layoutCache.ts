import type { GraphLayout } from './api';

export type Camera = NonNullable<GraphLayout['camera']>;

export interface CaseLayout {
  positions: Map<string, { x: number; y: number }>;
  camera: Camera | null;
}

// Survives the evidence board unmounting when the investigator switches tabs;
// the server copy (PUT /graph/layout) survives reloads and other devices.
const cache = new Map<number, CaseLayout>();

export function layoutFor(caseId: number, server?: GraphLayout): CaseLayout {
  let entry = cache.get(caseId);
  if (!entry) {
    entry = {
      positions: new Map(Object.entries(server?.positions || {}).map(([id, [x, y]]) => [id, { x, y }])),
      camera: server?.camera || null,
    };
    cache.set(caseId, entry);
  }
  return entry;
}

export function forgetLayout(caseId: number) {
  cache.delete(caseId);
}
