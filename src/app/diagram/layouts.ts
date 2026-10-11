import * as go from 'gojs/release/go';
import { LinkKind } from './node-data';

export type LayoutType = 'top-bottom' | 'bottom-top' | 'circle' | 'layered' | 'force' | 'grid';

export interface LayoutChoice {
  type: LayoutType;
  label: string;
  /** SVG path of a small line drawing of the layout, in a 24 x 24 box. */
  icon: string;
}

export const LAYOUTS: readonly LayoutChoice[] = [
  {
    type: 'top-bottom',
    label: 'Top to bottom',
    icon: 'M9 3h6v4H9zM3 17h6v4H3zM15 17h6v4h-6zM12 7v5M6 17v-5h12v5',
  },
  {
    type: 'bottom-top',
    label: 'Bottom to top',
    icon: 'M9 17h6v4H9zM3 3h6v4H3zM15 3h6v4h-6zM12 17v-5M6 7v5h12V7',
  },
  {
    type: 'circle',
    label: 'Circle',
    icon: 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16M10.5 2.5h3v3h-3zM10.5 18.5h3v3h-3zM2.5 10.5h3v3h-3zM18.5 10.5h3v3h-3z',
  },
  {
    type: 'layered',
    label: 'Layered digraph',
    icon: 'M9 2h6v4H9zM3 10h6v4H3zM15 10h6v4h-6zM9 18h6v4H9zM12 6l-6 4M12 6l6 4M6 14l6 4M18 14l-6 4',
  },
  {
    type: 'force',
    label: 'Force-directed',
    icon: 'M2.5 5a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M15.5 8a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M7.5 19a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M7.4 5.6l8.2 1.8M5.8 7.4l3.4 9.3M16.6 10.1l-5 7',
  },
  { type: 'grid', label: 'Grid', icon: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z' },
];

export const DEFAULT_LAYOUT: LayoutType = 'top-bottom';

const HIERARCHY: LinkKind = 'hierarchy';

/** Leaves only the hierarchy links in the network, so the layout follows the parent-child tree. */
function dropRelationEdges(network: go.LayoutNetwork): go.LayoutNetwork {
  for (const edge of network.edges.toArray()) {
    if (edge.link?.category !== HIERARCHY) network.deleteEdge(edge);
  }
  return network;
}

class HierarchyTreeLayout extends go.TreeLayout {
  override makeNetwork(coll: go.Diagram | go.Group | go.Iterable<go.Part>): go.LayoutNetwork {
    return dropRelationEdges(super.makeNetwork(coll));
  }
}

class HierarchyLayeredLayout extends go.LayeredDigraphLayout {
  override makeNetwork(coll: go.Diagram | go.Group | go.Iterable<go.Part>): go.LayoutNetwork {
    return dropRelationEdges(super.makeNetwork(coll));
  }
}

/** Free space left between nodes, wide enough for links to be routed through it. */
const NODE_GAP = 40;

/**
 * A force-directed result can still have overlapping nodes when the graph is as
 * densely linked as this one, so this spreads the finished layout out evenly
 * until every pair of nodes is at least NODE_GAP apart.
 */
class SpacedForceDirectedLayout extends go.ForceDirectedLayout {
  override commitLayout(): void {
    const vertexes = this.network?.vertexes.toArray() ?? [];
    let scale = 1;
    for (let i = 0; i < vertexes.length; i++) {
      const a = vertexes[i];
      for (let j = i + 1; j < vertexes.length; j++) {
        const b = vertexes[j];
        const needX = (a.width + b.width) / 2 + NODE_GAP;
        const needY = (a.height + b.height) / 2 + NODE_GAP;
        const dx = Math.abs(a.centerX - b.centerX);
        const dy = Math.abs(a.centerY - b.centerY);
        if (dx >= needX || dy >= needY) continue;
        // Scaling all centres by this much separates the pair along its better axis.
        scale = Math.max(scale, Math.min(needX / Math.max(dx, 1), needY / Math.max(dy, 1)));
      }
    }
    if (scale > 1) {
      for (const vertex of vertexes) {
        vertex.centerX *= scale;
        vertex.centerY *= scale;
      }
    }
    super.commitLayout();
  }
}

/** Up to this many nodes, a tree is drawn in the classic organisation-chart style. */
const CLASSIC_TREE_LIMIT = 60;

/**
 * The hierarchy as a tree that grows in the direction of `angle`: 90 is
 * downwards, 270 upwards.
 * - A small tree is drawn like an organisation chart: every parent centred over
 *   its children, and the lowest level stacked in one indented column next to
 *   its parent, which keeps the chart narrow enough to read.
 * - A big tree stacks the children of every node in two columns. Drawn the
 *   classic way it would be one very wide, very flat strip.
 */
function createTreeLayout(angle: 90 | 270, nodeCount: number): go.TreeLayout {
  const shared = { isOngoing: false, angle, layerSpacing: NODE_GAP, nodeSpacing: NODE_GAP };
  if (nodeCount > CLASSIC_TREE_LIMIT) {
    return new HierarchyTreeLayout({
      ...shared,
      alignment: go.TreeAlignment.Bus,
      // In a diagram this dense, lines pinned to one side of a node end up
      // running across other nodes, so here they may attach anywhere.
      setsPortSpot: false,
      setsChildPortSpot: false,
    });
  }
  // In a small tree the layout also sets where lines attach: they leave a parent
  // on the side that faces its children and arrive on the side that faces the parent.
  return new HierarchyTreeLayout({
    ...shared,
    treeStyle: go.TreeStyle.LastParents,
    // The column of leaves runs away from the root: down in a tree that grows
    // downwards, up in one that grows upwards.
    alternateAngle: 0,
    alternateAlignment: angle === 90 ? go.TreeAlignment.Start : go.TreeAlignment.End,
    alternateNodeIndent: NODE_GAP / 2,
    alternateNodeIndentPastParent: 1,
    alternateNodeSpacing: NODE_GAP / 2,
    alternateLayerSpacing: NODE_GAP,
    alternateLayerSpacingParentOverlap: 1,
    // One line runs down (or up) the free strip beside the column, from near the
    // parent's corner, and branches into the side of every leaf.
    alternatePortSpot: new go.Spot(0.001, angle === 90 ? 1 : 0, NODE_GAP / 2, 0),
    alternateChildPortSpot: go.Spot.Left,
  });
}

/**
 * Lets every line attach wherever suits its route again. The tree layouts pin
 * the hierarchy lines to particular sides of their nodes, which must not carry
 * over into the next layout. Call this inside the transaction that runs it.
 */
export function resetPortSpots(diagram: go.Diagram): void {
  diagram.nodes.each((node) => {
    node.port.fromSpot = go.Spot.None;
    node.port.toSpot = go.Spot.None;
  });
  diagram.links.each((link) => {
    // Cross links never follow a layout's sides; see their template.
    if (!link.isTreeLink) return;
    link.fromSpot = go.Spot.Default;
    link.toSpot = go.Spot.Default;
  });
}

/**
 * Every layout has isOngoing off: it runs when a model is loaded and when the
 * layout type is switched, but not after each edit. Otherwise every transaction
 * and every undo would also pay for (and record) a complete re-layout.
 */
export function createLayout(type: LayoutType, nodeCount: number): go.Layout {
  switch (type) {
    case 'top-bottom':
      return createTreeLayout(90, nodeCount);
    case 'bottom-top':
      return createTreeLayout(270, nodeCount);
    case 'layered':
      return new HierarchyLayeredLayout({
        isOngoing: false,
        direction: 90,
        layerSpacing: NODE_GAP,
        columnSpacing: NODE_GAP,
        setsPortSpots: false,
      });
    case 'force':
      return new SpacedForceDirectedLayout({
        isOngoing: false,
        defaultSpringLength: 80,
        defaultElectricalCharge: 300,
        setsPortSpots: false,
      });
    case 'circle':
      return new go.CircularLayout({ isOngoing: false, spacing: NODE_GAP });
    case 'grid':
      return new go.GridLayout({
        isOngoing: false,
        wrappingColumn: 20,
        spacing: new go.Size(NODE_GAP, NODE_GAP),
      });
  }
}
