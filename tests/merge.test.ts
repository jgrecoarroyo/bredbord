import { describe, expect, it } from 'vitest';
import { type CircuitDoc } from '../src/engine/circuit';
import { readDoc } from '../src/engine/document';
import { boardWithParts, mergeInto } from '../src/engine/merge';

function sample(): CircuitDoc {
  return {
    version: 1,
    boards: [
      { id: 'b1', type: 'core-bb830', x: 0, z: 0 },
      { id: 'b2', type: 'strip-bb830-top', x: 0, z: -30, on: 'b1' },
      { id: 'b3', type: 'bb830', x: 0, z: 80 },
    ],
    parts: [
      {
        id: 'p4',
        def: 'led-red',
        value: 3,
        pins: [
          { board: 'b1', hole: 'a10' },
          { board: 'b1', hole: 'd12' },
        ],
      },
      {
        id: 'p5',
        def: 'led-red',
        pins: [
          { board: 'b3', hole: 'a10' },
          { board: 'b3', hole: 'b10' },
        ],
      },
    ],
    wires: [
      {
        id: 'w6',
        a: { board: 'b1', hole: 'a1' },
        b: { board: 'b2', hole: 'T+1' },
        color: 'red',
        points: [{ x: 1, z: 2 }],
      },
      { id: 'w7', a: { board: 'b1', hole: 'a2' }, b: { board: 'b3', hole: 'a2' }, color: 'blue' },
    ],
    probes: [{ id: 'p8', at: { board: 'b1', hole: 'e5' } }],
    nextId: 9,
  };
}

describe('putting one circuit into another', () => {
  it('copies a board with its rails, the parts and wires wholly on it, and its probes', () => {
    const one = boardWithParts(sample(), 'b1')!;
    expect(one.boards.map((b) => b.id)).toEqual(['b1', 'b2']);
    expect(one.parts.map((p) => p.id)).toEqual(['p4']);
    expect(one.wires.map((w) => w.id)).toEqual(['w6']);
    expect(one.probes?.map((p) => p.id)).toEqual(['p8']);
  });

  it('renames everything, follows the renames, and moves it on the desk', () => {
    const doc = sample();
    const before = JSON.stringify(doc.parts);
    const merged = mergeInto(doc, boardWithParts(sample(), 'b1')!, 200, 10);
    expect(doc.boards).toHaveLength(5);
    const [board, rail] = merged.boards.map((id) => doc.boards.find((b) => b.id === id)!);
    expect(board).toMatchObject({ type: 'core-bb830', x: 200, z: 10 });
    expect(rail).toMatchObject({ on: board.id, x: 200, z: -20 });
    const part = doc.parts.find((p) => p.id === merged.parts[0])!;
    expect(part).toMatchObject({ def: 'led-red', value: 3 });
    expect(part.pins.map((p) => p.board)).toEqual([board.id, board.id]);
    const wire = doc.wires.find((w) => w.id === merged.wires[0])!;
    expect([wire.a.board, wire.b.board]).toEqual([board.id, rail.id]);
    expect(wire.points).toEqual([{ x: 201, z: 12 }]);
    expect(doc.probes?.at(-1)?.at.board).toBe(board.id);
    // The original is untouched, and every id is still unique.
    expect(JSON.stringify(doc.parts.slice(0, 2))).toBe(before);
    const ids = [...doc.boards, ...doc.parts, ...doc.wires, ...(doc.probes ?? [])].map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    // And it reads back as a valid circuit with nothing dropped.
    const read = readDoc(JSON.parse(JSON.stringify(doc)));
    expect('doc' in read && read.notes).toEqual([]);
  });
});
