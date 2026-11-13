/**
 * One demo hospital (PHC Hebbal, three floors) as a walkable graph.
 * Coordinates are metres on a 60 x 40 m floor plate, y downwards.
 * Lifts and stairs connect floors through same-named nodes.
 * Labels are i18n keys under hospital:places.*
 */
export type NodeKind = 'entrance' | 'corridor' | 'room' | 'lift' | 'stairs';

export interface HospitalNode {
  id: string;
  floor: number;
  x: number;
  y: number;
  kind: NodeKind;
  /** i18n key suffix (hospital:places.<label>); corridors have none. */
  label?: string;
}

export interface HospitalEdge {
  from: string;
  to: string;
  metres: number;
}

export interface HospitalGraph {
  id: string;
  floors: { index: number; label: string }[];
  width: number;
  height: number;
  nodes: HospitalNode[];
  edges: HospitalEdge[];
}

const n = (id: string, floor: number, x: number, y: number, kind: NodeKind, label?: string): HospitalNode => ({ id, floor, x, y, kind, label });
const e = (from: string, to: string, metres?: number): HospitalEdge => ({ from, to, metres: metres ?? 0 });

export const DEMO_HOSPITAL: HospitalGraph = {
  id: 'phc-hebbal',
  floors: [
    { index: 0, label: 'ground' },
    { index: 1, label: 'first' },
    { index: 2, label: 'second' },
  ],
  width: 60,
  height: 40,
  nodes: [
    // ground floor
    n('main_entrance', 0, 4, 36, 'entrance', 'mainEntrance'),
    n('emergency_entrance', 0, 56, 36, 'entrance', 'emergencyEntrance'),
    n('c0a', 0, 10, 30, 'corridor'),
    n('c0b', 0, 30, 30, 'corridor'),
    n('c0c', 0, 50, 30, 'corridor'),
    n('c0d', 0, 30, 14, 'corridor'),
    n('reception', 0, 10, 22, 'room', 'reception'),
    n('pharmacy', 0, 20, 8, 'room', 'pharmacy'),
    n('lab', 0, 40, 8, 'room', 'lab'),
    n('emergency', 0, 50, 20, 'room', 'emergency'),
    n('lift0', 0, 30, 22, 'lift', 'lift'),
    n('stairs0', 0, 44, 30, 'stairs', 'stairs'),
    // first floor
    n('lift1', 1, 30, 22, 'lift', 'lift'),
    n('stairs1', 1, 44, 30, 'stairs', 'stairs'),
    n('c1a', 1, 30, 30, 'corridor'),
    n('c1b', 1, 12, 30, 'corridor'),
    n('c1c', 1, 30, 12, 'corridor'),
    n('opd', 1, 12, 16, 'room', 'opd'),
    n('radiology', 1, 48, 12, 'room', 'radiology'),
    n('eye_clinic', 1, 12, 36, 'room', 'eyeClinic'),
    // second floor
    n('lift2', 2, 30, 22, 'lift', 'lift'),
    n('stairs2', 2, 44, 30, 'stairs', 'stairs'),
    n('c2a', 2, 30, 30, 'corridor'),
    n('c2b', 2, 14, 30, 'corridor'),
    n('maternity', 2, 14, 14, 'room', 'maternity'),
    n('ward', 2, 46, 14, 'room', 'ward'),
    n('vaccination', 2, 50, 34, 'room', 'vaccination'),
  ],
  edges: [
    e('main_entrance', 'c0a'),
    e('c0a', 'reception'),
    e('c0a', 'c0b'),
    e('c0b', 'c0c'),
    e('c0c', 'emergency_entrance'),
    e('c0c', 'emergency'),
    e('c0b', 'lift0'),
    e('lift0', 'c0d'),
    e('c0d', 'pharmacy'),
    e('c0d', 'lab'),
    e('c0c', 'stairs0'),
    e('lift0', 'lift1', 12),
    e('lift1', 'lift2', 12),
    e('stairs0', 'stairs1', 20),
    e('stairs1', 'stairs2', 20),
    e('lift1', 'c1a'),
    e('stairs1', 'c1a'),
    e('c1a', 'c1b'),
    e('c1b', 'opd'),
    e('c1b', 'eye_clinic'),
    e('lift1', 'c1c'),
    e('c1c', 'radiology'),
    e('lift2', 'c2a'),
    e('stairs2', 'c2a'),
    e('c2a', 'c2b'),
    e('c2b', 'maternity'),
    e('c2a', 'ward'),
    e('c2a', 'vaccination'),
  ],
};

/** Edge length: given for floor changes, else the plan distance. */
export function edgeMetres(g: HospitalGraph, edge: HospitalEdge): number {
  if (edge.metres > 0) return edge.metres;
  const a = g.nodes.find((x) => x.id === edge.from)!;
  const b = g.nodes.find((x) => x.id === edge.to)!;
  return Math.round(Math.hypot(a.x - b.x, a.y - b.y));
}

export const DESTINATIONS = ['opd', 'pharmacy', 'lab', 'emergency', 'maternity', 'radiology', 'ward', 'vaccination', 'eye_clinic', 'reception'] as const;
export const ENTRANCES = ['main_entrance', 'emergency_entrance'] as const;

/** The entrance QR codes printed at the doors encode `AMNAV.<hospitalId>.<nodeId>`. */
export const NAV_QR_PREFIX = 'AMNAV.';
export function parseEntranceQr(text: string, g: HospitalGraph = DEMO_HOSPITAL): string | null {
  if (!text.startsWith(NAV_QR_PREFIX)) return null;
  const [hospital, node] = text.slice(NAV_QR_PREFIX.length).split('.');
  if (hospital !== g.id) return null;
  return g.nodes.some((x) => x.id === node && x.kind === 'entrance') ? node : null;
}
