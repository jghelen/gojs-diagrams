import * as go from 'gojs/release/go';
import { LINE_SPACING, NODE_GAP } from './constants';
import { LineEnd, Side, facingSides, offsetsAlongSide } from './line-ends';

/**
 * Routes right-angled lines around the nodes of a big diagram, fast.
 *
 * GoJS can route lines around nodes itself, but it searches a way for every
 * line separately; at 500 nodes that takes seconds and beyond that minutes.
 * This router does not search. It relies on what the layouts produce: nodes
 * that stand in rows.
 *
 * - Between two rows there is a gap that is free from one side of the diagram
 *   to the other: a **lane**. A line may run along a lane as far as it likes.
 * - Within a row, between two neighbouring nodes, there is a gap from the lane
 *   above to the lane below: a **corridor**. A line changes lanes through one.
 *
 * So a line leaves its node (where, is told in line-ends.ts) into the nearest
 * lane, follows it to a corridor that leads on, and so forth, until it is in
 * the lane beside the node it ends at. It never touches a node on the way, and working that out takes about as
 * long as counting the rows it passes.
 *
 * Lines that use the same lane or corridor are then laid next to each other,
 * as close together as LINE_SPACING, so that they form a neat bundle in the
 * middle of the gap and each can still be told from the others.
 */

/** Room kept between a line and a node it passes. */
const CLEARANCE = 8;
/** The narrowest gap between two rows, or between two nodes of a row, that a line is sent through. */
const MIN_GAP = 2 * CLEARANCE + LINE_SPACING;
/** How far outside the outermost nodes a line runs when it has to go around everything. */
const OUTSIDE = NODE_GAP / 2;

/** A stretch of x that the nodes of a row take up; lines pass to its left and right. */
interface Wall {
  left: number;
  right: number;
}

/** A row of nodes: everything between two lanes. */
interface Band {
  top: number;
  bottom: number;
  /** The nodes of the row, from left to right. */
  nodes: go.Rect[];
  /** The same nodes as stretches of x, with nodes that stand too close for a line joined into one. */
  walls: Wall[];
}

/** Where a line can pass through a row. */
interface Corridor {
  x: number;
  /** How wide the gap is there. */
  room: number;
}

/**
 * One straight stretch of a route. A line is made of these, in turns: down (or
 * up), along a lane, down again, and so on.
 */
interface Run {
  vertical: boolean;
  /** Where the stretch would be if it had the gap to itself: an x if vertical, a lane's y if not. */
  base: number;
  /** For a stretch along a lane: which lane. */
  lane: number;
  /** From where to where it reaches, across its direction; used to see which stretches meet. */
  low: number;
  high: number;
  /** How wide the gap is that it runs in. */
  room: number;
  /** True for the stretch that meets a node: that one keeps its place on the node's side. */
  pinned: boolean;
  /** How far it is moved aside to lie next to the other lines in the same gap. */
  offset: number;
}

/** What is asked of the router for one line: the two nodes it joins. */
export interface LaneRequest<Id> {
  id: Id;
  source: go.Rect;
  target: go.Rect;
}

/**
 * Works out the routes of all these lines among these nodes. A line is missing
 * from the result when there is no way for it through lanes and corridors,
 * which happens where the nodes do not stand in rows; the caller then keeps
 * whatever route the line had.
 */
export function routeThroughLanes<Id>(
  nodes: readonly go.Rect[],
  requests: readonly LaneRequest<Id>[],
): Map<Id, go.Point[]> {
  const bands = bandsOf(nodes);
  const lanes = lanesBetween(bands);
  // First on which side of its two nodes every line attaches...
  interface Planned {
    request: LaneRequest<Id>;
    fromBand: number;
    toBand: number;
    sides: { from: Side; to: Side };
    startX: number;
    endX: number;
  }
  const planned: Planned[] = [];
  for (const request of requests) {
    const { source, target } = request;
    const fromBand = bandIndex(bands, source);
    const toBand = bandIndex(bands, target);
    if (fromBand < 0 || toBand < 0 || source === target) continue;
    const facing = facingSides(source, target);
    const from = sideWithWayOut(bands[fromBand], source, facing.from);
    const to = sideWithWayOut(bands[toBand], target, facing.to);
    // A node in the middle of a clump of nodes has no free way to a lane.
    if (!from || !to) continue;
    planned.push({ request, fromBand, toBand, sides: { from, to }, startX: 0, endX: 0 });
  }

  // ...then where on that side: the lines of a side stand next to each other.
  const sidesInUse = new Map<go.Rect, Record<Side, { plan: Planned; start: boolean }[]>>();
  const attach = (node: go.Rect, side: Side, plan: Planned, start: boolean): void => {
    let sides = sidesInUse.get(node);
    if (!sides) sidesInUse.set(node, (sides = { top: [], bottom: [] }));
    sides[side].push({ plan, start });
  };
  for (const plan of planned) {
    attach(plan.request.source, plan.sides.from, plan, true);
    attach(plan.request.target, plan.sides.to, plan, false);
  }
  for (const [node, sides] of sidesInUse) {
    for (const attached of [sides.top, sides.bottom]) {
      const ends: LineEnd[] = attached.map(({ plan, start }) => {
        const other = start ? plan.request.target : plan.request.source;
        return { otherX: other.centerX, distance: Math.abs(other.centerY - node.centerY) };
      });
      offsetsAlongSide(ends, node.centerX, node.width).forEach((offset, i) => {
        const { plan, start } = attached[i];
        if (start) plan.startX = node.centerX + offset;
        else plan.endX = node.centerX + offset;
      });
    }
  }

  const routes = new Map<Id, { runs: Run[]; startY: number; endY: number }>();
  for (const { request, fromBand, toBand, sides, startX, endX } of planned) {
    const { id, source, target } = request;
    // Lane k lies above row k, lane k + 1 below it.
    let lane = sides.from === 'top' ? fromBand : fromBand + 1;
    const lastLane = sides.to === 'top' ? toBand : toBand + 1;

    const runs: Run[] = [];
    let x = startX;
    let down = vertical(startX, lane, true);
    while (lane !== lastLane) {
      const next = lastLane > lane ? lane + 1 : lane - 1;
      const corridor = corridorThrough(bands[Math.min(lane, next)], x, endX);
      if (corridor.x !== x) {
        // Along the lane to the corridor, and on from there.
        closeAt(down, lane);
        runs.push(down, along(lanes, lane, x, corridor.x));
        down = vertical(corridor.x, lane, false);
      }
      down.room = Math.min(down.room, corridor.room);
      x = corridor.x;
      lane = next;
    }
    closeAt(down, lane);
    if (x !== endX) {
      runs.push(down, along(lanes, lane, x, endX));
      down = vertical(endX, lane, true);
      closeAt(down, lane);
    }
    // The last stretch meets the node, at its place on the side.
    down.pinned = true;
    runs.push(down);

    routes.set(id, {
      runs,
      startY: sides.from === 'top' ? source.top : source.bottom,
      endY: sides.to === 'top' ? target.top : target.bottom,
    });
  }

  laySideBySide([...routes.values()].flatMap((route) => route.runs));

  const result = new Map<Id, go.Point[]>();
  for (const [id, { runs, startY, endY }] of routes) {
    const points = [new go.Point(runs[0].base + runs[0].offset, startY)];
    for (let i = 1; i < runs.length - 1; i += 2) {
      const y = runs[i].base + runs[i].offset;
      points.push(new go.Point(runs[i - 1].base + runs[i - 1].offset, y));
      points.push(new go.Point(runs[i + 1].base + runs[i + 1].offset, y));
    }
    const last = runs[runs.length - 1];
    points.push(new go.Point(last.base + last.offset, endY));
    result.set(id, points);
  }
  return result;

  function vertical(atX: number, fromLane: number, pinned: boolean): Run {
    const y = lanes[fromLane].y;
    return {
      vertical: true,
      base: atX,
      lane: -1,
      low: y,
      high: y,
      room: Infinity,
      pinned,
      offset: 0,
    };
  }

  /** Lets a vertical stretch end in this lane. */
  function closeAt(run: Run, lane: number): void {
    const y = lanes[lane].y;
    run.low = Math.min(run.low, y);
    run.high = Math.max(run.high, y);
  }
}

/** A stretch along a lane, from one x to another. */
function along(lanes: readonly Lane[], lane: number, from: number, to: number): Run {
  return {
    vertical: false,
    base: lanes[lane].y,
    lane,
    low: Math.min(from, to),
    high: Math.max(from, to),
    room: lanes[lane].room,
    pinned: false,
    offset: 0,
  };
}

// ----- Rows, lanes and corridors -----

/**
 * Sorts the nodes into rows. Two nodes belong to the same row when there is no
 * gap between them, from top to bottom, that is wide enough for a line.
 */
function bandsOf(nodes: readonly go.Rect[]): Band[] {
  const bands: Band[] = [];
  for (const node of [...nodes].sort((a, b) => a.top - b.top)) {
    const band = bands[bands.length - 1];
    if (band && node.top - band.bottom < MIN_GAP) {
      band.bottom = Math.max(band.bottom, node.bottom);
      band.nodes.push(node);
    } else {
      bands.push({ top: node.top, bottom: node.bottom, nodes: [node], walls: [] });
    }
  }
  for (const band of bands) {
    band.nodes.sort((a, b) => a.left - b.left);
    for (const node of band.nodes) {
      const wall = band.walls[band.walls.length - 1];
      if (wall && node.left - wall.right < MIN_GAP) wall.right = Math.max(wall.right, node.right);
      else band.walls.push({ left: node.left, right: node.right });
    }
  }
  return bands;
}

/** A gap between two rows, free from one side of the diagram to the other. */
interface Lane {
  /** Its middle. */
  y: number;
  /** How wide it is. */
  room: number;
}

/** The lanes: one above the first row, one between every two rows, one below the last. */
function lanesBetween(bands: readonly Band[]): Lane[] {
  if (bands.length === 0) return [];
  const lanes: Lane[] = [{ y: bands[0].top - OUTSIDE, room: 2 * OUTSIDE }];
  for (let i = 1; i < bands.length; i++) {
    const room = bands[i].top - bands[i - 1].bottom;
    lanes.push({ y: bands[i - 1].bottom + room / 2, room });
  }
  lanes.push({ y: bands[bands.length - 1].bottom + OUTSIDE, room: 2 * OUTSIDE });
  return lanes;
}

/** Which row a node stands in; -1 if it is not one of the nodes the rows were made from. */
function bandIndex(bands: readonly Band[], node: go.Rect): number {
  let low = 0;
  let high = bands.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (node.top > bands[middle].bottom) low = middle + 1;
    else if (node.bottom < bands[middle].top) high = middle - 1;
    else return middle;
  }
  return -1;
}

/**
 * The side on which a line can leave the node for a lane: the side it should
 * use if the way from there is free, otherwise the opposite side, and null if
 * the node is shut in on both.
 */
function sideWithWayOut(band: Band, node: go.Rect, wanted: Side): Side | null {
  if (reachesLane(band, node, wanted)) return wanted;
  const opposite: Side = wanted === 'top' ? 'bottom' : 'top';
  return reachesLane(band, node, opposite) ? opposite : null;
}

/**
 * Whether a line can go straight from the middle of that side of the node to
 * the lane beside its row. In a tidy row it always can. Where nodes were moved
 * by hand until rows ran into each other, another node may stand in the way.
 */
function reachesLane(band: Band, node: go.Rect, side: Side): boolean {
  const x = node.centerX;
  return !band.nodes.some(
    (other) =>
      other !== node &&
      other.left - CLEARANCE < x &&
      x < other.right + CLEARANCE &&
      (side === 'top' ? other.top < node.top : other.bottom > node.bottom),
  );
}

/**
 * Where a line that comes along at `x` and is headed for `towards` passes
 * through a row: straight on if nothing is in its way there, and otherwise
 * through the gap beside whatever is, on the side that costs the smaller detour.
 */
function corridorThrough(band: Band, x: number, towards: number): Corridor {
  const { walls } = band;
  // The first wall that does not lie wholly to the left of x.
  let low = 0;
  let high = walls.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (walls[middle].right + CLEARANCE <= x) low = middle + 1;
    else high = middle;
  }
  const wall = walls[low];
  if (!wall || x <= wall.left - CLEARANCE) {
    // Free: the gap between the wall before and this one (or the open side).
    const from = low > 0 ? walls[low - 1].right : -Infinity;
    const to = wall ? wall.left : Infinity;
    // Twice the distance to the nearer wall: the room the line has around it.
    return { x, room: 2 * Math.min(x - from, to - x) };
  }
  const left = gapBetween(walls[low - 1], wall);
  const right = gapBetween(wall, walls[low + 1]);
  const detour = (gap: Corridor) => Math.abs(gap.x - x) + Math.abs(gap.x - towards);
  return detour(left) <= detour(right) ? left : right;
}

/** The gap between two neighbouring walls of a row; either may be missing at the ends of the row. */
function gapBetween(before: Wall | undefined, after: Wall | undefined): Corridor {
  if (before && after) {
    return { x: (before.right + after.left) / 2, room: after.left - before.right };
  }
  if (after) return { x: after.left - OUTSIDE, room: 2 * OUTSIDE };
  return { x: (before?.right ?? 0) + OUTSIDE, room: 2 * OUTSIDE };
}

// ----- Lines next to each other -----

/**
 * Moves the stretches that share a gap apart, so that none lies on another:
 * those in the same lane up and down, those in the same corridor left and
 * right. They are packed as closely as LINE_SPACING, and closer still where a
 * gap holds more lines than fit at that distance, around the middle of the gap.
 *
 * Stretches that do not meet anywhere may share a place: two lines that use
 * the same lane at opposite ends of the diagram do not need two of its tracks.
 */
function laySideBySide(runs: readonly Run[]): void {
  const gaps = new Map<string, Run[]>();
  for (const run of runs) {
    // The stretch at a node keeps its place on the node's side.
    if (run.pinned) continue;
    const key = run.vertical ? `x${Math.round(run.base)}` : `lane${run.lane}`;
    const sharing = gaps.get(key);
    if (sharing) sharing.push(run);
    else gaps.set(key, [run]);
  }

  for (const sharing of gaps.values()) {
    if (sharing.length < 2) continue;
    sharing.sort((a, b) => a.low - b.low || a.high - b.high);
    // Each stretch takes the first track that is free where it begins.
    const trackEnds: number[] = [];
    const trackOf = new Map<Run, number>();
    let room = Infinity;
    for (const run of sharing) {
      let track = trackEnds.findIndex((end) => end < run.low);
      if (track < 0) track = trackEnds.length;
      trackEnds[track] = run.high;
      trackOf.set(run, track);
      room = Math.min(room, run.room);
    }
    const tracks = trackEnds.length;
    if (tracks < 2) continue;
    const spacing = Math.min(LINE_SPACING, Math.max(0, room - 2 * CLEARANCE) / (tracks - 1));
    for (const run of sharing) run.offset = (trackOf.get(run)! - (tracks - 1) / 2) * spacing;
  }
}
