// The gates inside a logic chip, drawn in the chip outline of the card's pin list: each gate's
// symbol, wired to the pins it uses. A still drawing, like the diagram on a datasheet.

import type { GateLayout } from '../engine/sim/chips';

/** Width of the drawing, px: the package's column less its border. */
export const GATES_WIDTH = 93;
/** Height of a pin row in the pin list, px. */
const ROW = 22;
/** Where the first row's middle is, measured inside the package's border. */
const FIRST = 12.5;
/** Where a gate's body starts, out from the pins its inputs come from. */
const BODY = 16;
/** Where inputs turn from their pin's row towards the gate. */
const TURN = 8;
const SVG = 'http://www.w3.org/2000/svg';

/** An SVG of a chip's gates, sized to sit inside the package of a pin list with `pins` pins. */
export function gatesDrawing(layout: GateLayout, pins: number): SVGSVGElement {
  const half = pins / 2;
  const height = half * ROW + 3;
  const W = GATES_WIDTH;
  const left = (p: number): boolean => p <= half;
  const rowY = (p: number): number => FIRST + ROW * (left(p) ? p - 1 : pins - p);

  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'gates');
  svg.setAttribute('viewBox', `0 0 ${W} ${height}`);
  svg.setAttribute('width', String(W));
  svg.setAttribute('height', String(height));
  svg.setAttribute('aria-hidden', 'true');

  for (const gate of layout.gates) {
    const homeLeft = gate.inputs.filter(left).length * 2 >= gate.inputs.length;
    // Drawn as if its inputs were on the left; a gate whose inputs are on the right is mirrored.
    const home = (p: number): boolean => left(p) === homeLeft;
    const homeRows = gate.inputs.filter(home).map(rowY);
    const y = homeRows.reduce((a, b) => a + b, 0) / homeRows.length;
    const g = document.createElementNS(SVG, 'g');
    if (!homeLeft) g.setAttribute('transform', `translate(${W},0) scale(-1,1)`);

    // Input slots down the gate's back, a cross-side input (only ever one) at the top.
    const n = gate.inputs.length;
    const gap = n === 3 ? 6 : 8;
    const order = [...gate.inputs].sort((a, b) => (home(a) ? 1 : 0) - (home(b) ? 1 : 0) || rowY(a) - rowY(b));
    const lines: string[] = [];
    order.forEach((p, i) => {
      const slot = y + (i - (n - 1) / 2) * gap;
      const py = rowY(p);
      if (home(p)) lines.push(py === slot ? `M0 ${py}H${BODY + 2}` : `M0 ${py}H${TURN}V${slot}H${BODY + 2}`);
      else lines.push(`M${W} ${py}H${W - 5}V9H12V${slot}H${BODY + 2}`);
    });

    const { body, tip } = symbol(layout.gate, y, !!layout.schmitt);
    const out = rowY(gate.output);
    if (home(gate.output)) lines.push(`M${tip} ${y}H${tip + 4}V${out}H0`);
    else lines.push(`M${tip} ${y}H${W - 10}V${out}H${W}`);
    if (gate.enable !== undefined) {
      const top = y - 5.5;
      lines.push(`M0 ${rowY(gate.enable)}H24V${top - 2}`);
      body.push(circle(24, top, 2));
    }

    const leads = document.createElementNS(SVG, 'path');
    leads.setAttribute('class', 'lead');
    leads.setAttribute('d', lines.join(''));
    g.append(leads, ...body);
    svg.append(g);
  }
  return svg;
}

/** A gate's symbol with its back at `BODY` and its middle at `y`, and where its output leaves it. */
function symbol(kind: GateLayout['gate'], y: number, schmitt: boolean): { body: SVGElement[]; tip: number } {
  const x = BODY;
  const t = y - 8;
  const b = y + 8;
  const or = (x: number): string =>
    `M${x - 1} ${t}Q${x + 10} ${t} ${x + 17} ${y}Q${x + 10} ${b} ${x - 1} ${b}Q${x + 3} ${y} ${x - 1} ${t}Z`;
  const body: SVGElement[] = [];
  let tip: number;
  switch (kind) {
    case 'and':
    case 'nand':
      body.push(path(`M${x} ${t}H${x + 8}A8 8 0 0 1 ${x + 8} ${b}H${x}Z`));
      tip = x + 16;
      break;
    case 'or':
    case 'nor':
      body.push(path(or(x)));
      tip = x + 17;
      break;
    case 'xor':
      body.push(path(or(x + 3)), path(`M${x - 1} ${t}Q${x + 3} ${y} ${x - 1} ${b}`, 'back'));
      tip = x + 20;
      break;
    case 'not':
    case 'buffer':
      body.push(path(`M${x} ${y - 7}L${x + 14} ${y}L${x} ${y + 7}Z`));
      tip = x + 14;
      if (schmitt) body.push(path(`M${x + 1} ${y + 2}h4v-4h2M${x + 3} ${y + 2}v-4h4`, 'mark'));
      break;
  }
  if (kind === 'nand' || kind === 'nor' || kind === 'not') {
    body.push(circle(tip + 2, y, 2));
    tip += 4;
  }
  return { body, tip };
}

/**
 * A chip that is better drawn as blocks than as gates (a multiplexer, a shift register): its paths, in the
 * same frame as `gatesDrawing`, so pin rows sit at `FIRST + ROW × row` down each side, 0 to `GATES_WIDTH` across.
 */
export interface BlockLayout {
  /** Wires from the pins. */
  leads: string;
  /** Outlines, drawn like a gate's body. */
  bodies: readonly string[];
  /** Thin lines inside the bodies: a register's cell walls. */
  walls?: string;
  /** Strokes inside the bodies: the shift path, a clock wedge. */
  marks?: string;
  /** Inversion bubbles. */
  bubbles?: readonly (readonly [number, number])[];
  /** Where wires join. */
  dots?: readonly (readonly [number, number])[];
  /** Small letters inside the bodies, [x, y, text]. */
  labels?: readonly (readonly [number, number, string])[];
}

export const BLOCK_LAYOUTS: Readonly<Record<string, BlockLayout>> = {
  // Two 4-to-1 multiplexers: each takes its C inputs on its tall side and puts Y out of its short one. B, G and A
  // come in on top (G with a bubble: active low); B and A go to both halves.
  '74HC153': {
    leads: [
      'M0 12.5H21V46.3',
      'M0 34.5H16V46.8M16 34.5H40V26H67V75.8',
      'M93 34.5H72V68.3',
      'M93 56.5H77V68.8M86 56.5V42H27V54.5',
      'M0 56.5H12M0 78.5H12M0 100.5H12M0 122.5H12',
      'M93 78.5H81M93 100.5H81M93 122.5H81M93 144.5H81',
      'M32 89.5H36V144.5H0',
      'M61 111.5H57V166.5H93',
    ].join(''),
    bodies: ['M12 44L32 58V121L12 135Z', 'M81 66L61 80V143L81 157Z'],
    bubbles: [
      [21, 48.3],
      [72, 70.3],
    ],
    dots: [
      [16, 34.5],
      [86, 56.5],
    ],
  },
  // An 8-bit shift register drawn as its eight cells, A–D down the right beside their pins and E–H down the left.
  // SER comes in under A, bits move up through D, across to E and down to H, and H leaves as QH and Q̄H. CLK and
  // INH meet in an OR whose output clocks it; SH/LD (low to load) comes in on top.
  '74HC165': {
    leads: [
      'M0 12.5H32V41.5',
      'M0 34.5H14V16H43V22.7',
      'M93 34.5H79V16H50V22.7',
      'M46.5 39V45.5',
      'M0 56.5H27M0 78.5H27M0 100.5H27M0 122.5H27',
      'M93 56.5H66M93 78.5H66M93 100.5H66M93 122.5H66',
      'M93 144.5H53V133.5',
      'M40 133.5V166.5H93M40 155H26M22 155H8V144.5H0',
    ].join(''),
    bodies: ['M27 45.5H66V133.5H27Z', 'M38.5 21Q38.5 32 46.5 39Q54.5 32 54.5 21Q46.5 25 38.5 21Z'],
    walls: 'M27 67.5H66M27 89.5H66M27 111.5H66',
    marks: ['M43 45.5L46.5 50L50 45.5', 'M53 133.5V51H40V129M37.5 126L40 130L42.5 126'].join(''),
    bubbles: [
      [32, 43.5],
      [24, 155],
    ],
    dots: [[40, 155]],
    labels: [
      [29.5, 59, 'E'],
      [29.5, 81, 'F'],
      [29.5, 103, 'G'],
      [29.5, 125, 'H'],
      [59.5, 59, 'D'],
      [59.5, 81, 'C'],
      [59.5, 103, 'B'],
      [59.5, 125, 'A'],
    ],
  },
};

/** An SVG of a chip drawn as blocks, sized like `gatesDrawing`. */
export function blockDrawing(layout: BlockLayout, pins: number): SVGSVGElement {
  const W = GATES_WIDTH;
  const height = (pins / 2) * ROW + 3;
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'gates');
  svg.setAttribute('viewBox', `0 0 ${W} ${height}`);
  svg.setAttribute('width', String(W));
  svg.setAttribute('height', String(height));
  svg.setAttribute('aria-hidden', 'true');
  svg.append(path(layout.leads, 'lead'), ...layout.bodies.map((d) => path(d)));
  if (layout.walls) svg.append(path(layout.walls, 'wall'));
  if (layout.marks) svg.append(path(layout.marks, 'mark'));
  for (const [x, y] of layout.bubbles ?? []) svg.append(circle(x, y, 2));
  for (const [x, y] of layout.dots ?? []) {
    const dot = circle(x, y, 1.6);
    dot.setAttribute('class', 'dot');
    svg.append(dot);
  }
  for (const [x, y, text] of layout.labels ?? []) {
    const t = document.createElementNS(SVG, 'text');
    t.setAttribute('class', 'label');
    t.setAttribute('x', String(x));
    t.setAttribute('y', String(y));
    t.textContent = text;
    svg.append(t);
  }
  return svg;
}

function path(d: string, cls = 'gate'): SVGPathElement {
  const p = document.createElementNS(SVG, 'path');
  p.setAttribute('class', cls);
  p.setAttribute('d', d);
  return p;
}

function circle(cx: number, cy: number, r: number): SVGCircleElement {
  const c = document.createElementNS(SVG, 'circle');
  c.setAttribute('class', 'gate');
  c.setAttribute('cx', String(cx));
  c.setAttribute('cy', String(cy));
  c.setAttribute('r', String(r));
  return c;
}
