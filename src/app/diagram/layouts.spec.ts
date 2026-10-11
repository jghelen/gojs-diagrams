import * as go from 'gojs/release/go';
import {
  countNodeOverlaps,
  createTestDiagram,
  linksOf,
  nodesOf,
} from '../../testing/diagram-harness';
import { LAYOUTS, LayoutType, createLayout, resetPortSpots } from './layouts';
import { DEFAULT_LAYOUT } from './constants';

const ALL_LAYOUTS = LAYOUTS.map((layout) => layout.type);

describe('layout list', () => {
  it('offers the tree both ways up, a circle, and three more', () => {
    expect(ALL_LAYOUTS).toEqual(['top-bottom', 'bottom-top', 'circle', 'layered', 'force', 'grid']);
    expect(LAYOUTS.map((layout) => layout.label).slice(0, 3)).toEqual([
      'Top to bottom',
      'Bottom to top',
      'Circle',
    ]);
  });

  it('has an icon for every layout', () => {
    for (const layout of LAYOUTS) expect(layout.icon).toMatch(/^M/);
    expect(new Set(LAYOUTS.map((layout) => layout.icon)).size).toBe(LAYOUTS.length);
  });

  it('starts with top to bottom', () => {
    expect(DEFAULT_LAYOUT).toBe('top-bottom');
  });
});

describe('createLayout', () => {
  const classes: Record<LayoutType, new () => go.Layout> = {
    'top-bottom': go.TreeLayout,
    'bottom-top': go.TreeLayout,
    circle: go.CircularLayout,
    layered: go.LayeredDigraphLayout,
    force: go.ForceDirectedLayout,
    grid: go.GridLayout,
  };

  it.each(ALL_LAYOUTS)('builds the right kind of layout for %s', (type) => {
    expect(createLayout(type, 30)).toBeInstanceOf(classes[type]);
  });

  it.each(ALL_LAYOUTS)('does not re-run %s after every edit', (type) => {
    expect(createLayout(type, 30).isOngoing).toBe(false);
  });

  it('grows the tree downwards or upwards', () => {
    expect((createLayout('top-bottom', 30) as go.TreeLayout).angle).toBe(90);
    expect((createLayout('bottom-top', 30) as go.TreeLayout).angle).toBe(270);
  });

  it('draws a small tree like an organisation chart, with lines pinned to the facing sides', () => {
    const tree = createLayout('top-bottom', 30) as go.TreeLayout;
    expect(tree.treeStyle).toBe(go.TreeStyle.LastParents);
    expect(tree.setsPortSpot).toBe(true);
    expect(tree.alternateChildPortSpot.equals(go.Spot.Left)).toBe(true);
  });

  it('stacks the children of a big tree in two columns and leaves the line ends free', () => {
    const tree = createLayout('top-bottom', 200) as go.TreeLayout;
    expect(tree.alignment).toBe(go.TreeAlignment.Bus);
    expect(tree.setsPortSpot).toBe(false);
    expect(tree.setsChildPortSpot).toBe(false);
  });
});

describe.each(ALL_LAYOUTS)('%s layout on a diagram', (type) => {
  it('gives every node a position and overlaps none', () => {
    const { diagram } = createTestDiagram({ layout: type });
    for (const node of nodesOf(diagram)) expect(node.location.isReal()).toBe(true);
    expect(countNodeOverlaps(diagram)).toBe(0);
  });
});

describe('tree direction', () => {
  const hierarchyLinks = (diagram: go.Diagram) =>
    linksOf(diagram).filter((link) => link.data.category === 'hierarchy');

  it('puts every child below its parent in top to bottom', () => {
    const { diagram } = createTestDiagram({ layout: 'top-bottom' });
    for (const link of hierarchyLinks(diagram)) {
      expect(link.toNode!.location.y).toBeGreaterThan(link.fromNode!.location.y);
    }
  });

  it('puts every child above its parent in bottom to top', () => {
    const { diagram } = createTestDiagram({ layout: 'bottom-top' });
    for (const link of hierarchyLinks(diagram)) {
      expect(link.toNode!.location.y).toBeLessThan(link.fromNode!.location.y);
    }
  });
});

describe('force-directed layout', () => {
  it('leaves no overlapping nodes even in a densely linked diagram', () => {
    const { diagram } = createTestDiagram({ count: 100, layout: 'force', linkType: 'straight' });
    expect(countNodeOverlaps(diagram)).toBe(0);
  });
});

describe('resetPortSpots', () => {
  it('lets lines attach anywhere again after a tree layout pinned them', () => {
    const { diagram } = createTestDiagram({ layout: 'top-bottom' });
    const hierarchy = linksOf(diagram).filter((link) => link.isTreeLink);
    expect(hierarchy.some((link) => !link.fromSpot.isDefault())).toBe(true);

    diagram.commit((d) => resetPortSpots(d), null);
    for (const link of hierarchy) {
      expect(link.fromSpot.isDefault()).toBe(true);
      expect(link.toSpot.isDefault()).toBe(true);
    }
    for (const node of nodesOf(diagram)) {
      expect(node.port.fromSpot.isNone()).toBe(true);
      expect(node.port.toSpot.isNone()).toBe(true);
    }
  });
});
