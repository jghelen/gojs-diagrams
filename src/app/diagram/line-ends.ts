import * as go from 'gojs/release/go';
import { LINE_SPACING } from './constants';

/**
 * Where a relationship line attaches to its nodes.
 *
 * A line always attaches to the top or the bottom side of a node, in the middle
 * of it. Where several lines attach to the same side, they stand next to each
 * other around the middle, LINE_SPACING apart, so that each of them can be seen
 * and clicked right up to the node.
 */

/** The top or the bottom side of a node. */
export type Side = 'top' | 'bottom';

/** Room kept between the outermost line on a side and the corner of the node. */
const CORNER_MARGIN = 20;

/**
 * On which sides a line leaves the fund that invests (`source`) and arrives at
 * the fund it invests in (`target`):
 *
 * - target below the source: out of the bottom, into the top;
 * - target above the source, as in a tree that grows upwards: out of the top, into the bottom;
 * - side by side: over the tops of both.
 */
export function facingSides(source: go.Rect, target: go.Rect): { from: Side; to: Side } {
  if (target.top >= source.bottom) return { from: 'bottom', to: 'top' };
  if (target.bottom <= source.top) return { from: 'top', to: 'bottom' };
  return { from: 'top', to: 'top' };
}

/** One line at a side of a node, described by the node at its other end. */
export interface LineEnd {
  /** The middle of that other node, from left to right. */
  otherX: number;
  /** How far up or down that other node is. */
  distance: number;
}

/**
 * How far from the middle of a node's side each of the lines on that side
 * attaches; negative is to the left. The answers come in the order of `ends`.
 *
 * - A single line attaches in the middle.
 * - Several lines stand side by side around the middle, in the order of where
 *   they lead: the line to the node furthest left is the leftmost. That way
 *   they do not cross each other right at the node.
 * - A line to a node that stands straight above or below gets the very middle,
 *   and the others arrange themselves around it. The same holds at its other
 *   end, so that line is a straight one.
 * - On a side with more lines than fit at LINE_SPACING, they move closer
 *   together rather than reach the corners of the node.
 */
export function offsetsAlongSide(
  ends: readonly LineEnd[],
  centerX: number,
  width: number,
): number[] {
  const count = ends.length;
  if (count < 2) return ends.map(() => 0);
  const reach = Math.max(0, width / 2 - CORNER_MARGIN);
  const spacing = Math.min(LINE_SPACING, (2 * reach) / (count - 1));

  const fromLeft = ends.map((_, index) => index).sort((a, b) => ends[a].otherX - ends[b].otherX);
  const offsets = new Array<number>(count);
  fromLeft.forEach((index, rank) => (offsets[index] = (rank - (count - 1) / 2) * spacing));

  // The line that can be a straight one: to the nearest node right above or below.
  let straight = -1;
  ends.forEach((end, index) => {
    if (Math.abs(end.otherX - centerX) >= 1) return;
    if (straight < 0 || end.distance < ends[straight].distance) straight = index;
  });
  if (straight < 0) return offsets;
  // Everything moves over until that line is in the middle, as far as the side allows.
  const shift = Math.max(
    -reach - Math.min(...offsets),
    Math.min(reach - Math.max(...offsets), -offsets[straight]),
  );
  return offsets.map((offset) => offset + shift);
}
