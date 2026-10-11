import * as go from 'gojs/release/go';
import { LINE_SPACING } from './constants';
import { LaneRequest, routeThroughLanes } from './lane-router';

/** The size every node has here, and the gap between two of them. */
const WIDTH = 160;
const HEIGHT = 100;
const GAP = 60;

/** A node in a grid of rows and columns, counted from 0. */
function nodeAt(column: number, row: number): go.Rect {
  return new go.Rect(column * (WIDTH + GAP), row * (HEIGHT + GAP), WIDTH, HEIGHT);
}

/** Whether a route runs through any node except the two it joins. */
function crossesNode(points: go.Point[], nodes: go.Rect[], own: go.Rect[]): boolean {
  return nodes.some(
    (node) =>
      !own.includes(node) &&
      points.some(
        (point, i) =>
          i > 0 &&
          go.Rect.intersectsLineSegment(
            node.x,
            node.y,
            node.width,
            node.height,
            points[i - 1].x,
            points[i - 1].y,
            point.x,
            point.y,
          ),
      ),
  );
}

function isRightAngled(points: go.Point[]): boolean {
  return points.every(
    (point, i) => i === 0 || point.x === points[i - 1].x || point.y === points[i - 1].y,
  );
}

function route(nodes: go.Rect[], source: go.Rect, target: go.Rect): go.Point[] | undefined {
  return routeThroughLanes(nodes, [{ id: 'line', source, target }]).get('line');
}

describe('routeThroughLanes', () => {
  it('draws a straight line between two nodes that stand one right under the other', () => {
    const [top, bottom] = [nodeAt(0, 0), nodeAt(0, 1)];
    expect(route([top, bottom], top, bottom)).toEqual([
      new go.Point(top.centerX, top.bottom),
      new go.Point(bottom.centerX, bottom.top),
    ]);
  });

  it('starts and ends in the middle of the facing sides', () => {
    const [source, target] = [nodeAt(0, 0), nodeAt(2, 1)];
    const points = route([source, target], source, target)!;
    expect(points[0]).toEqual(new go.Point(source.centerX, source.bottom));
    expect(points[points.length - 1]).toEqual(new go.Point(target.centerX, target.top));
    expect(isRightAngled(points)).toBe(true);
    // Down into the gap between the rows, along it, down into the target.
    expect(points).toHaveLength(4);
    expect(points[1].y).toBe(source.bottom + GAP / 2);
  });

  it('goes around a node that stands between the two', () => {
    const [source, between, target] = [nodeAt(0, 0), nodeAt(0, 1), nodeAt(0, 2)];
    const nodes = [source, between, target];
    const points = route(nodes, source, target)!;
    expect(crossesNode(points, nodes, [source, target])).toBe(false);
    expect(isRightAngled(points)).toBe(true);
    // Beside the node in the way, outside the row, since the row has no gap.
    expect(points.some((point) => point.x < between.left || point.x > between.right)).toBe(true);
    expect(points[points.length - 1]).toEqual(new go.Point(target.centerX, target.top));
  });

  it('passes through the gap between two nodes of a row that is in its way', () => {
    const source = nodeAt(1, 0);
    const row = [nodeAt(0, 1), nodeAt(1, 1), nodeAt(2, 1)];
    const target = nodeAt(1, 2);
    const nodes = [source, ...row, target];
    const points = route(nodes, source, target)!;
    expect(crossesNode(points, nodes, [source, target])).toBe(false);
    // Through one of the two gaps of that row, in its middle.
    const gaps = [row[0].right + GAP / 2, row[1].right + GAP / 2];
    const through = points.filter(
      (point) => point.y > row[0].top - 1 && point.y < row[0].bottom + 1,
    );
    expect(through).toEqual([]);
    const columns = new Set(points.map((point) => point.x));
    expect(gaps.some((x) => columns.has(x))).toBe(true);
  });

  it('goes straight down through several rows when nothing is in the way', () => {
    const source = nodeAt(1, 0);
    const target = nodeAt(1, 3);
    const nodes = [source, nodeAt(0, 1), nodeAt(2, 1), nodeAt(0, 2), nodeAt(2, 2), target];
    // The column between is free, as under a parent in a tree: nodes left and right of it only.
    nodes[1].x -= WIDTH;
    nodes[3].x -= WIDTH;
    nodes[2].x += WIDTH;
    nodes[4].x += WIDTH;
    expect(route(nodes, source, target)).toEqual([
      new go.Point(source.centerX, source.bottom),
      new go.Point(target.centerX, target.top),
    ]);
  });

  it('runs upwards the same way, out of the top and into the bottom', () => {
    const [source, between, target] = [nodeAt(0, 2), nodeAt(0, 1), nodeAt(1, 0)];
    const nodes = [source, between, target];
    const points = route(nodes, source, target)!;
    expect(points[0]).toEqual(new go.Point(source.centerX, source.top));
    expect(points[points.length - 1]).toEqual(new go.Point(target.centerX, target.bottom));
    expect(crossesNode(points, nodes, [source, target])).toBe(false);
  });

  it('joins two nodes of the same row over their tops, clear of the node between them', () => {
    const [source, between, target] = [nodeAt(0, 1), nodeAt(1, 1), nodeAt(2, 1)];
    const nodes = [nodeAt(1, 0), source, between, target];
    const points = route(nodes, source, target)!;
    expect(points).toEqual([
      new go.Point(source.centerX, source.top),
      new go.Point(source.centerX, source.top - GAP / 2),
      new go.Point(target.centerX, target.top - GAP / 2),
      new go.Point(target.centerX, target.top),
    ]);
  });

  describe('lines that share a gap', () => {
    /** One row of sources above one row of targets; every line crosses the lane between them. */
    const sources = [0, 1, 2, 3, 4, 5].map((column) => nodeAt(column, 0));
    const targets = [0, 1, 2, 3, 4, 5].map((column) => nodeAt(column, 1));
    const nodes = [...sources, ...targets];
    const laneY = sources[0].bottom + GAP / 2;
    /** The height at which a line runs along the lane. */
    const heightOf = (points: go.Point[]): number => points[1].y;
    const request = (id: string, from: number, to: number): LaneRequest<string> => ({
      id,
      source: sources[from],
      target: targets[to],
    });

    it('lie next to each other, as near as LINE_SPACING, around the middle of the gap', () => {
      const routes = routeThroughLanes(nodes, [request('a', 0, 5), request('b', 1, 4)]);
      const heights = [heightOf(routes.get('a')!), heightOf(routes.get('b')!)].sort(
        (x, y) => x - y,
      );
      expect(heights[1] - heights[0]).toBe(LINE_SPACING);
      expect((heights[0] + heights[1]) / 2).toBe(laneY);
    });

    it('have the middle of the gap to themselves when alone', () => {
      const routes = routeThroughLanes(nodes, [request('a', 0, 5)]);
      expect(heightOf(routes.get('a')!)).toBe(laneY);
    });

    it('share a place when they do not meet anywhere', () => {
      // One line at the left end of the lane, one at the right end.
      const routes = routeThroughLanes(nodes, [request('left', 0, 1), request('right', 4, 5)]);
      expect(heightOf(routes.get('left')!)).toBe(laneY);
      expect(heightOf(routes.get('right')!)).toBe(laneY);
    });

    it('move closer together when the gap holds more of them than fit', () => {
      const many: LaneRequest<string>[] = [];
      for (let i = 0; i < 30; i++) many.push(request(`line ${i}`, i % 2, 5 - (i % 2)));
      const routes = routeThroughLanes(nodes, many);
      const heights = [...routes.values()].map(heightOf).sort((x, y) => x - y);
      // All different, all inside the gap, clear of the rows above and below.
      expect(new Set(heights).size).toBe(30);
      expect(heights[0]).toBeGreaterThan(sources[0].bottom + 5);
      expect(heights[29]).toBeLessThan(targets[0].top - 5);
      expect(heights[1] - heights[0]).toBeLessThan(LINE_SPACING);
    });

    it('meet their nodes side by side, around the middle of the side', () => {
      const routes = routeThroughLanes(nodes, [
        request('a', 0, 5),
        request('b', 0, 4),
        request('c', 1, 5),
      ]);
      const start = (id: string) => routes.get(id)![0].x;
      const end = (id: string) => routes.get(id)![routes.get(id)!.length - 1].x;
      // Two lines leave the first source: the one that leads less far right is the left one.
      expect(start('b')).toBe(sources[0].centerX - LINE_SPACING / 2);
      expect(start('a')).toBe(sources[0].centerX + LINE_SPACING / 2);
      // Two lines arrive at the last target: the one that comes from further left is the left one.
      expect(end('a')).toBe(targets[5].centerX - LINE_SPACING / 2);
      expect(end('c')).toBe(targets[5].centerX + LINE_SPACING / 2);
      // A line that is alone on its side is in the middle.
      expect(start('c')).toBe(sources[1].centerX);
      expect(end('b')).toBe(targets[4].centerX);
      for (const points of routes.values()) expect(isRightAngled(points)).toBe(true);
    });
  });

  describe('nodes that do not stand in tidy rows', () => {
    it('lets a line leave by the other side when a node stands right below its node', () => {
      // Two rows so close together that no line fits between them: one clump.
      const source = nodeAt(0, 0);
      const below = new go.Rect(0, HEIGHT + 10, WIDTH, HEIGHT);
      const target = nodeAt(2, 3);
      const nodes = [source, below, target];
      const points = route(nodes, source, target)!;
      expect(points[0]).toEqual(new go.Point(source.centerX, source.top));
      expect(crossesNode(points, nodes, [source, target])).toBe(false);
    });

    it('gives no route for a node that is shut in from above and below', () => {
      const above = new go.Rect(0, 0, WIDTH, HEIGHT);
      const source = new go.Rect(0, HEIGHT + 10, WIDTH, HEIGHT);
      const below = new go.Rect(0, 2 * (HEIGHT + 10), WIDTH, HEIGHT);
      const target = nodeAt(3, 4);
      expect(route([above, source, below, target], source, target)).toBeUndefined();
    });

    it('gives no route for a node it was not told about', () => {
      const [known, other] = [nodeAt(0, 0), nodeAt(1, 1)];
      expect(route([known], known, new go.Rect(5000, 5000, WIDTH, HEIGHT))).toBeUndefined();
      expect(route([known, other], known, other)).toBeDefined();
    });
  });

  it('never runs through a node, however the nodes of a grid are joined', () => {
    // A grid with holes in it, and lines between nodes picked at random, the same every time.
    let seed = 7;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const nodes: go.Rect[] = [];
    for (let row = 0; row < 12; row++) {
      for (let column = 0; column < 14; column++) {
        if (random() < 0.75) nodes.push(nodeAt(column, row));
      }
    }
    const requests: LaneRequest<number>[] = [];
    for (let i = 0; i < 400; i++) {
      const source = nodes[Math.floor(random() * nodes.length)];
      const target = nodes[Math.floor(random() * nodes.length)];
      if (source !== target) requests.push({ id: i, source, target });
    }
    const routes = routeThroughLanes(nodes, requests);
    expect(routes.size).toBe(requests.length);
    for (const { id, source, target } of requests) {
      const points = routes.get(id)!;
      expect(isRightAngled(points)).toBe(true);
      expect(crossesNode(points, nodes, [source, target])).toBe(false);
      // On the side of its node, clear of the corners.
      expect(Math.abs(points[0].x - source.centerX)).toBeLessThanOrEqual(WIDTH / 2 - 20);
      expect(Math.abs(points[points.length - 1].x - target.centerX)).toBeLessThanOrEqual(
        WIDTH / 2 - 20,
      );
    }
  });

  it('gives the same routes every time', () => {
    const nodes = [nodeAt(0, 0), nodeAt(1, 0), nodeAt(0, 1), nodeAt(1, 1), nodeAt(2, 2)];
    const requests: LaneRequest<number>[] = [
      { id: 1, source: nodes[0], target: nodes[4] },
      { id: 2, source: nodes[1], target: nodes[2] },
      { id: 3, source: nodes[3], target: nodes[0] },
    ];
    const text = () =>
      [...routeThroughLanes(nodes, requests)].map(([id, points]) => `${id}: ${points.join(' ')}`);
    expect(text()).toEqual(text());
  });

  it('routes nothing in an empty diagram', () => {
    expect(routeThroughLanes([], []).size).toBe(0);
  });
});
