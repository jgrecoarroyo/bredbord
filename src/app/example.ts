// Small working circuits to learn from, in the examples menu. Each is a saved .breadboard.json.

import type { CircuitDoc } from '../engine/circuit';
import nand from './examples/nand-gate.breadboard.json';
import clock555 from './examples/555-clock.breadboard.json';
import counter from './examples/4-bit-counter.breadboard.json';
import register from './examples/4-bit-register.breadboard.json';
import computerClock from './examples/8-bit-computer-clock.breadboard.json';

const example = (title: string, saved: unknown) => ({
  title,
  make: (): CircuitDoc => structuredClone(saved) as CircuitDoc,
});

/** The examples menu. */
export const EXAMPLES: readonly { title: string; make: () => CircuitDoc | Promise<CircuitDoc> }[] = [
  example('NAND gate', nand),
  example('555 clock', clock555),
  example('4-bit counter', counter),
  example('4-bit register', register),
  example('8-bit computer clock', computerClock),
];
