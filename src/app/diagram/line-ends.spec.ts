import * as go from 'gojs/release/go';
import { LINE_SPACING } from './constants';
import { LineEnd, facingSides, offsetsAlongSide } from './line-ends';

const node = (x: number, y: number) => new go.Rect(x, y, 160, 100);

describe('facingSides', () => {
  it('leaves the bottom and arrives at the top when the target is below', () => {
    expect(facingSides(node(0, 0), node(600, 300))).toEqual({ from: 'bottom', to: 'top' });
  });

  it('leaves the top and arrives at the bottom when the target is above', () => {
    expect(facingSides(node(0, 300), node(600, 0))).toEqual({ from: 'top', to: 'bottom' });
  });

  it('joins two nodes that stand side by side over their tops', () => {
    expect(facingSides(node(0, 100), node(600, 100))).toEqual({ from: 'top', to: 'top' });
    // Also when one stands a little lower than the other.
    expect(facingSides(node(0, 100), node(600, 140))).toEqual({ from: 'top', to: 'top' });
  });

  it('counts a target that starts exactly where the source ends as below', () => {
    expect(facingSides(node(0, 0), node(0, 100))).toEqual({ from: 'bottom', to: 'top' });
  });
});

describe('offsetsAlongSide', () => {
  /** A side of a node whose middle is at x = 1000 and that is 160 wide. */
  const offsets = (...ends: LineEnd[]) => offsetsAlongSide(ends, 1000, 160);
  const to = (otherX: number, distance = 300): LineEnd => ({ otherX, distance });

  it('puts a single line in the middle', () => {
    expect(offsets(to(200))).toEqual([0]);
    expect(offsets()).toEqual([]);
  });

  it('puts two lines either side of the middle, LINE_SPACING apart', () => {
    expect(offsets(to(200), to(1800))).toEqual([-LINE_SPACING / 2, LINE_SPACING / 2]);
  });

  it('orders the lines by where they lead, whatever order they were given in', () => {
    expect(offsets(to(1800), to(200), to(1400))).toEqual([LINE_SPACING, -LINE_SPACING, 0]);
  });

  it('keeps the order given for lines that lead to the same place', () => {
    expect(offsets(to(200), to(200), to(200))).toEqual([-LINE_SPACING, 0, LINE_SPACING]);
  });

  it('gives the middle to the line that leads straight up or down', () => {
    // Two lines to the left, one straight down, one to the right.
    expect(offsets(to(200), to(500), to(1000), to(1800))).toEqual([
      -2 * LINE_SPACING,
      -LINE_SPACING,
      0,
      LINE_SPACING,
    ]);
  });

  it('gives it to the nearest of several nodes that stand straight above or below', () => {
    const [far, near, left] = offsets(to(1000, 900), to(1000, 300), to(200));
    expect(near).toBe(0);
    // The other two keep their order, from left to right, beside it.
    expect(far).toBe(-LINE_SPACING);
    expect(left).toBe(-2 * LINE_SPACING);
  });

  it('moves the lines closer together rather than out to the corners', () => {
    const many = Array.from({ length: 41 }, (_, i) => to(i * 50));
    const result = offsetsAlongSide(many, 1000, 160);
    // 160 wide, 20 kept free at each corner: 120 for 41 lines.
    expect(result[0]).toBe(-60);
    expect(result[40]).toBe(60);
    expect(result[1] - result[0]).toBeCloseTo(3, 10);
    expect(new Set(result).size).toBe(41);
  });

  it('keeps all lines on the side when the straight one is the outermost', () => {
    const many = [to(1000), ...Array.from({ length: 30 }, (_, i) => to(2000 + i * 50))];
    const result = offsetsAlongSide(many, 1000, 160);
    expect(Math.min(...result)).toBeGreaterThanOrEqual(-60);
    expect(Math.max(...result)).toBeLessThanOrEqual(60);
    // As near to the middle as that allows.
    expect(result[0]).toBe(-60);
  });
});
