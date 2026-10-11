import * as go from 'gojs/release/go';
import {
  countNodeOverlaps,
  createTestDiagram,
  linksOf,
  nodesOf,
} from '../../testing/diagram-harness';
import { LAYOUTS, LayoutType, createLayout } from './layouts';
import { DEFAULT_LAYOUT, NODE_GAP } from './constants';

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

  it('draws a small tree like an organisation chart, with the leaves in a column straight under their parent', () => {
    const tree = createLayout('top-bottom', 30) as go.TreeLayout;
    expect(tree.treeStyle).toBe(go.TreeStyle.LastParents);
    // No shift to the side: the column has the same left edge as the parent.
    expect(tree.alternateLayerSpacing).toBe(0);
    expect(tree.alternateLayerSpacingParentOverlap).toBe(1);
    // The same gap from parent to leaf and from leaf to leaf as between any two rows.
    expect(tree.alternateNodeIndent).toBe(tree.layerSpacing);
    expect(tree.alternateNodeSpacing).toBe(tree.layerSpacing);
  });

  it('stacks the children of a big tree in two columns, with the same gap between all rows', () => {
    const tree = createLayout('top-bottom', 200) as go.TreeLayout;
    expect(tree.alignment).toBe(go.TreeAlignment.Bus);
    expect(tree.rowSpacing).toBe(tree.layerSpacing);
  });

  it.each(['top-bottom', 'bottom-top'] as const)(
    'leaves it to the lines where they attach to their nodes (%s)',
    (type) => {
      for (const count of [30, 200]) {
        const tree = createLayout(type, count) as go.TreeLayout;
        expect(tree.setsPortSpot).toBe(false);
        expect(tree.setsChildPortSpot).toBe(false);
      }
    },
  );
});

describe('grid layout', () => {
  it('puts 20 nodes in a row, however wide the view is', () => {
    const { diagram } = createTestDiagram({ count: 100, layout: 'grid', linkType: 'straight' });
    const columns = new Set(nodesOf(diagram).map((node) => Math.round(node.location.x)));
    const rows = new Set(nodesOf(diagram).map((node) => Math.round(node.location.y)));
    expect(columns.size).toBe(20);
    expect(rows.size).toBe(5);
    expect((diagram.layout as go.GridLayout).isViewportSized).toBe(false);
  });

  it('leaves the nodes where they are when the view is zoomed or resized', () => {
    const test = createTestDiagram({ count: 100, layout: 'grid', linkType: 'straight' });
    const places = () => nodesOf(test.diagram).map((node) => node.location.toString());
    const before = places();
    test.diagram.scale = 0.2;
    test.settle();
    test.diagram.viewSize = new go.Size(400, 300);
    test.settle();
    test.diagram.zoomToFit();
    test.settle();
    expect(places()).toEqual(before);
    // Nothing moved, so nothing was recorded either.
    expect(test.history.length).toBe(0);
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

describe('room between nodes', () => {
  /** The smallest free space between any two nodes of a diagram, across or down. */
  const smallestGap = (diagram: go.Diagram): number => {
    const boxes = nodesOf(diagram).map((node) => node.actualBounds);
    let smallest = Infinity;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const dx = Math.max(boxes[i].left - boxes[j].right, boxes[j].left - boxes[i].right);
        const dy = Math.max(boxes[i].top - boxes[j].bottom, boxes[j].top - boxes[i].bottom);
        smallest = Math.min(smallest, Math.max(dx, dy));
      }
    }
    return smallest;
  };

  it('is wide enough in every layout for lines and their percentages to pass', () => {
    for (const layout of ['grid', 'layered', 'force'] as const) {
      const { diagram } = createTestDiagram({ count: 30, layout, linkType: 'straight' });
      expect(smallestGap(diagram)).toBeGreaterThanOrEqual(NODE_GAP - 1);
    }
    // On a circle the room is measured along the circle, so across or down it is a little less.
    const circle = createTestDiagram({ count: 30, layout: 'circle', linkType: 'straight' });
    expect(smallestGap(circle.diagram)).toBeGreaterThanOrEqual(NODE_GAP * 0.75);
  });
});

describe('force-directed layout', () => {
  it('leaves no overlapping nodes even in a densely linked diagram', () => {
    const { diagram } = createTestDiagram({ count: 100, layout: 'force', linkType: 'straight' });
    expect(countNodeOverlaps(diagram)).toBe(0);
  });

  it('arranges the same diagram the same way every time', () => {
    const places = () =>
      nodesOf(createTestDiagram({ count: 30, layout: 'force', linkType: 'straight' }).diagram).map(
        (node) => `${Math.round(node.location.x)},${Math.round(node.location.y)}`,
      );
    expect(places()).toEqual(places());
  });

  it('leaves no overlapping nodes with room for cards either', () => {
    const { diagram } = createTestDiagram({
      count: 100,
      layout: 'force',
      linkType: 'straight',
      cardsExpanded: true,
    });
    expect(countNodeOverlaps(diagram)).toBe(0);
  });
});
