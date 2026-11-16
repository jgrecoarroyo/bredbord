// Putting one circuit into another: a saved file added to the desk, or a board copied with everything
// on it. Everything gets a fresh id, so nothing clashes with what's already there.

import { allocId, type CircuitDoc, type HoleRef, type Id } from './circuit';

/** What a merge put on the desk, by kind, with their new ids. */
export interface Merged {
  boards: Id[];
  parts: Id[];
  wires: Id[];
  /** Bench supplies, meters and scopes. */
  instruments: Id[];
}

/** The letters an id starts with ('b' for 'b12'), so a copy is named like the original. */
const prefixOf = (id: Id): string => /^[a-z]+/i.exec(id)?.[0] ?? 'x';

/**
 * Adds a copy of everything in `from` to `doc`, moved `dx`, `dz` mm on the desk. Ids are new, and
 * every reference (a pin's board, a rail clipped to its board, a wire's ends) follows its renamed
 * object. The name and memory of `doc` stay as they are.
 */
export function mergeInto(doc: CircuitDoc, from: CircuitDoc, dx: number, dz: number): Merged {
  const src = structuredClone(from);
  const rename = new Map<Id, Id>();
  const fresh = (id: Id): Id => {
    const to = allocId(doc, prefixOf(id));
    rename.set(id, to);
    return to;
  };
  const out: Merged = { boards: [], parts: [], wires: [], instruments: [] };
  // Desk objects first, so holes on them can be renamed.
  for (const b of src.boards) out.boards.push((b.id = fresh(b.id)));
  for (const list of [src.supplies, src.meters, src.scopes])
    for (const o of list ?? []) out.instruments.push((o.id = fresh(o.id)));
  const hole = (r: HoleRef): HoleRef => ({ board: rename.get(r.board) ?? r.board, hole: r.hole });
  for (const b of src.boards) {
    b.x += dx;
    b.z += dz;
    if (b.on) b.on = rename.get(b.on);
    if (!b.on) delete b.on;
    doc.boards.push(b);
  }
  for (const [list, into] of [
    [src.supplies, (doc.supplies ??= [])],
    [src.meters, (doc.meters ??= [])],
    [src.scopes, (doc.scopes ??= [])],
  ] as const) {
    for (const o of list ?? []) {
      o.x += dx;
      o.z += dz;
      (into as (typeof o)[]).push(o);
    }
  }
  for (const p of src.parts) {
    p.id = fresh(p.id);
    p.pins = p.pins.map(hole);
    out.parts.push(p.id);
    doc.parts.push(p);
  }
  for (const w of src.wires) {
    w.id = fresh(w.id);
    w.a = hole(w.a);
    w.b = hole(w.b);
    if (w.points) w.points = w.points.map((p) => ({ x: p.x + dx, z: p.z + dz }));
    out.wires.push(w.id);
    doc.wires.push(w);
  }
  for (const p of src.probes ?? []) {
    p.id = fresh(p.id);
    p.at = hole(p.at);
    (doc.probes ??= []).push(p);
  }
  // Tidy: no empty lists left behind for kinds neither circuit has.
  for (const key of ['supplies', 'meters', 'scopes', 'probes'] as const) if (doc[key]?.length === 0) delete doc[key];
  return out;
}

/**
 * A board with everything on it, as a circuit of its own: the rails clipped to it, the parts with
 * every leg in it, the wires with both ends in it, and its probes. Wires off to other boards stay behind.
 */
export function boardWithParts(doc: CircuitDoc, id: Id): CircuitDoc | null {
  const board = doc.boards.find((b) => b.id === id);
  if (!board) return null;
  const boards = [board, ...doc.boards.filter((b) => b.on === id)];
  const ids = new Set(boards.map((b) => b.id));
  const on = (r: HoleRef): boolean => ids.has(r.board);
  return structuredClone({
    version: doc.version,
    boards,
    parts: doc.parts.filter((p) => p.pins.length > 0 && p.pins.every(on)),
    wires: doc.wires.filter((w) => on(w.a) && on(w.b)),
    ...(doc.probes?.some((p) => on(p.at)) ? { probes: doc.probes.filter((p) => on(p.at)) } : {}),
    nextId: 1,
  });
}
