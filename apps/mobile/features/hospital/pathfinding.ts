import { DEMO_HOSPITAL, edgeMetres, type HospitalGraph, type HospitalNode } from './graph';

export interface RouteStep {
  kind: 'start' | 'walk' | 'lift' | 'stairs' | 'arrive';
  /** Node reached at the end of this step. */
  nodeId: string;
  floor: number;
  metres: number;
  /** For lift/stairs: the floor you get out on. */
  toFloor?: number;
  /** Direction relative to the previous leg: left / right / straight (undefined on the first leg). */
  turn?: 'left' | 'right' | 'straight';
  /** Place label key, when the step ends at a labelled place. */
  label?: string;
}

export interface Route {
  path: HospitalNode[];
  metres: number;
  steps: RouteStep[];
  /** Nodes of the path grouped by floor, for drawing. */
  byFloor: Record<number, HospitalNode[]>;
}

/** Dijkstra over the hospital graph. Returns null if there is no path. */
export function shortestPath(from: string, to: string, g: HospitalGraph = DEMO_HOSPITAL): HospitalNode[] | null {
  const byId = new Map(g.nodes.map((x) => [x.id, x]));
  if (!byId.has(from) || !byId.has(to)) return null;
  const adj = new Map<string, { to: string; w: number }[]>();
  for (const ed of g.edges) {
    const w = edgeMetres(g, ed);
    adj.set(ed.from, [...(adj.get(ed.from) ?? []), { to: ed.to, w }]);
    adj.set(ed.to, [...(adj.get(ed.to) ?? []), { to: ed.from, w }]);
  }
  const dist = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, string>();
  const done = new Set<string>();
  while (true) {
    let cur: string | null = null;
    let best = Infinity;
    for (const [id, d] of dist) if (!done.has(id) && d < best) (best = d), (cur = id);
    if (cur === null) break;
    if (cur === to) break;
    done.add(cur);
    for (const { to: nxt, w } of adj.get(cur) ?? []) {
      const nd = best + w;
      if (nd < (dist.get(nxt) ?? Infinity)) {
        dist.set(nxt, nd);
        prev.set(nxt, cur);
      }
    }
  }
  if (!dist.has(to)) return null;
  const path: HospitalNode[] = [];
  for (let id: string | undefined = to; id !== undefined; id = prev.get(id)) path.unshift(byId.get(id)!);
  return path[0]?.id === from ? path : null;
}

function turnOf(a: HospitalNode, b: HospitalNode, c: HospitalNode): 'left' | 'right' | 'straight' {
  const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
  if (Math.abs(cross) < 1e-6) return 'straight';
  // y grows downwards on the plan, so a positive cross product is a right turn
  return cross > 0 ? 'right' : 'left';
}

/** Turn-by-turn steps: corridor legs are merged into one "walk" per labelled place or turn. */
export function buildRoute(from: string, to: string, g: HospitalGraph = DEMO_HOSPITAL): Route | null {
  const path = shortestPath(from, to, g);
  if (!path) return null;
  const steps: RouteStep[] = [{ kind: 'start', nodeId: path[0].id, floor: path[0].floor, metres: 0, label: path[0].label }];
  let total = 0;
  let legMetres = 0;
  let legStart = path[0];
  for (let i = 1; i < path.length; i++) {
    const prev = path[i - 1];
    const cur = path[i];
    const m = edgeMetres(g, { from: prev.id, to: cur.id, metres: g.edges.find((x) => (x.from === prev.id && x.to === cur.id) || (x.from === cur.id && x.to === prev.id))?.metres ?? 0 });
    total += m;
    if (cur.floor !== prev.floor) {
      if (legMetres > 0) steps.push({ kind: 'walk', nodeId: prev.id, floor: prev.floor, metres: legMetres, label: prev.label });
      steps.push({ kind: cur.kind === 'stairs' ? 'stairs' : 'lift', nodeId: cur.id, floor: prev.floor, toFloor: cur.floor, metres: m });
      legMetres = 0;
      legStart = cur;
      continue;
    }
    legMetres += m;
    const last = i === path.length - 1;
    const next = path[i + 1];
    const turnsNext = !last && next.floor === cur.floor && legStart.id !== cur.id && turnOf(legStart.id === prev.id ? legStart : prev, cur, next) !== 'straight';
    if (last || cur.kind === 'room' || turnsNext || cur.kind === 'lift' || cur.kind === 'stairs') {
      const turn = steps.length > 1 && steps[steps.length - 1].kind === 'walk' ? turnOf(path[Math.max(0, i - 2)], prev, cur) : undefined;
      if (last) steps.push({ kind: 'arrive', nodeId: cur.id, floor: cur.floor, metres: legMetres, label: cur.label, turn });
      else steps.push({ kind: 'walk', nodeId: cur.id, floor: cur.floor, metres: legMetres, label: cur.label, turn: turnsNext ? turnOf(prev, cur, next) : turn });
      legMetres = 0;
      legStart = cur;
    }
  }
  // Merge consecutive lift (or stairs) legs: lift0 -> lift1 -> lift2 is one ride to the second floor.
  const merged: RouteStep[] = [];
  for (const s of steps) {
    const prev = merged[merged.length - 1];
    if (prev && (s.kind === 'lift' || s.kind === 'stairs') && prev.kind === s.kind) {
      merged[merged.length - 1] = { ...prev, nodeId: s.nodeId, toFloor: s.toFloor, metres: prev.metres + s.metres };
    } else merged.push(s);
  }
  // Floors where the route only passes through a lift or stairwell are not drawn.
  const byFloor: Record<number, HospitalNode[]> = {};
  for (const node of path) (byFloor[node.floor] ??= []).push(node);
  for (const [f, nodes] of Object.entries(byFloor)) {
    if (nodes.length === 1 && (nodes[0].kind === 'lift' || nodes[0].kind === 'stairs')) delete byFloor[Number(f)];
  }
  return { path, metres: total, steps: merged, byFloor };
}

/** Rough walking time at 1.2 m/s, in whole minutes (at least 1). */
export function walkMinutes(metres: number): number {
  return Math.max(1, Math.round(metres / 72));
}
