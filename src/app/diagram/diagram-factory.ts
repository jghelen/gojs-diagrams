// 'gojs/release/go' is always the production build. Plain 'gojs' resolves to the
// slower debug build under `ng serve`, which would inflate the timings.
import * as go from 'gojs/release/go';
import { LayoutType } from './layouts';
import { LinkType, linkStyle } from './link-types';
import { LinkData, LinkKind, NodeData } from './node-data';

/** Model-wide settings. Kept in the model so that switching them is undone with everything else. */
export interface ModelData {
  layoutType: LayoutType;
  linkType: LinkType;
}

export type NodeModel = go.GraphLinksModel<NodeData, LinkData, ModelData>;

/** Picks a readable text colour for the given "#rrggbb" fill. */
function textColorFor(fill: string): string {
  const rgb = parseInt(fill.slice(1), 16);
  const luminance = 0.299 * (rgb >> 16) + 0.587 * ((rgb >> 8) & 0xff) + 0.114 * (rgb & 0xff);
  return luminance < 140 ? '#f9fafb' : '#111827';
}

/**
 * Part.dragComputation: keeps a dragged node where it is when the new position
 * would put it on top of a node that is not being dragged along.
 */
function avoidNodeOverlap(part: go.Part, _newLoc: go.Point, snappedLoc: go.Point): go.Point {
  const diagram = part.diagram;
  if (!diagram) return snappedLoc;
  const bounds = part.actualBounds;
  const loc = part.location;
  const target = new go.Rect(
    snappedLoc.x - (loc.x - bounds.x),
    snappedLoc.y - (loc.y - bounds.y),
    bounds.width,
    bounds.height,
  );
  const occupied = diagram
    .findPartsIn(target, true)
    .any((other) => other instanceof go.Node && other !== part && !other.isSelected);
  return occupied ? loc : snappedLoc;
}

// Every node has this size whatever its shape and text, so editing a node never
// makes it grow into its neighbours.
const NODE_WIDTH = 172;
const NODE_HEIGHT = 96;
/** Width of the band along the edge of a node from which a new link can be dragged. */
const LINK_RIM = 9;

// The content is a centred stack: title, subtitle, then the icon row. These are
// the distances from the node's centre line to the far edge of the two text rows.
const TITLE_REACH = 22;
const SUBTITLE_REACH = 8;
const TEXT_PADDING = 8;

/** Width of a node-sized figure at `dy` above or below its centre line. */
function figureWidthAt(figure: go.FigureName, dy: number): number {
  const a = NODE_WIDTH / 2;
  const b = NODE_HEIGHT / 2;
  switch (figure) {
    case go.Figures.Diamond:
      return 2 * a * (1 - dy / b);
    case go.Figures.Ellipse:
      return 2 * a * Math.sqrt(1 - (dy / b) ** 2);
    case go.Figures.Capsule:
      return 2 * (a - b + Math.sqrt(b * b - dy * dy));
    default:
      return NODE_WIDTH;
  }
}

/**
 * Binding conversion from a node's shape to the widest a text row may be and
 * still stay inside that shape; a diamond is much narrower near its tips than
 * a rectangle. Longer text is cut off with an ellipsis.
 */
function textLimit(reach: number): (figure: go.FigureName) => go.Size {
  return (figure) => new go.Size(figureWidthAt(figure, reach) - TEXT_PADDING, NaN);
}

const ONE_LINE = { maxLines: 1, overflow: go.TextOverflow.Ellipsis };

const COLOR_ICON = 'COLOR';
const COMMENT_ICON = 'COMMENT';
const BATCH_ICON = 'BATCH';

/** A hover hint for an icon. */
function hint(text: string): go.Adornment {
  return go.GraphObject.build<go.Adornment>(go.Builders.ToolTip).add(
    new go.TextBlock(text, { margin: 4, font: '11px system-ui, sans-serif' }),
  );
}

// Shared by every node: a rainbow that reads as "color" at a glance.
const RAINBOW = new go.Brush(go.BrushType.Linear, {
  0: '#ef4444',
  0.25: '#f59e0b',
  0.5: '#22c55e',
  0.75: '#3b82f6',
  1: '#a855f7',
  start: go.Spot.Left,
  end: go.Spot.Right,
});

/** The rainbow chip under a node's subtitle. Clicks on it are handled in handleClicks. */
function createColorIcon(): go.Shape {
  return new go.Shape({
    name: COLOR_ICON,
    figure: go.Figures.Circle,
    desiredSize: new go.Size(13, 13),
    fill: RAINBOW,
    // A white rim keeps the chip visible on any node color.
    stroke: '#ffffff',
    strokeWidth: 1.5,
    cursor: 'pointer',
    toolTip: hint('Change color'),
  });
}

/**
 * The speech bubble next to the color chip, with a red dot on its corner while
 * the node has a comment. Clicks on it are handled in handleClicks.
 */
function createCommentIcon(): go.Panel {
  return new go.Panel(go.PanelTypes.Spot, {
    name: COMMENT_ICON,
    cursor: 'pointer',
    toolTip: hint('Add comment'),
  }).add(
    new go.Shape({
      geometryString: 'F M1 1 H14 V10 H7 L4 13 V10 H1z',
      fill: '#ffffff',
      stroke: '#374151',
      strokeWidth: 1,
    }),
    new go.Shape({
      figure: go.Figures.Circle,
      desiredSize: new go.Size(7, 7),
      alignment: go.Spot.TopRight,
      fill: '#dc2626',
      stroke: '#ffffff',
      strokeWidth: 1,
    }).bind('visible', 'comment', (comment: string) => comment !== ''),
  );
}

/** The plus in a box after the comment bubble. Clicks on it are handled in handleClicks. */
function createBatchIcon(): go.Panel {
  return new go.Panel(go.PanelTypes.Auto, {
    name: BATCH_ICON,
    cursor: 'pointer',
    toolTip: hint('Add Batch'),
  }).add(
    new go.Shape({
      figure: go.Figures.RoundedRectangle,
      desiredSize: new go.Size(13, 13),
      fill: '#ffffff',
      stroke: '#374151',
      strokeWidth: 1,
    }),
    new go.Shape({
      figure: go.Figures.PlusLine,
      desiredSize: new go.Size(7, 7),
      stroke: '#15803d',
      strokeWidth: 1.75,
    }),
  );
}

/**
 * A hover hint with the whole of a node's title or subtitle. It only appears
 * while the node itself has had to cut that text off.
 */
function fullTextHint(field: 'title' | 'subtitle'): go.Adornment {
  return go.GraphObject.build<go.Adornment>(go.Builders.ToolTip)
    .bindObject('visible', 'adornedObject', (text: go.TextBlock | null) => !!text?.isOverflowed)
    .add(
      new go.TextBlock({
        margin: 4,
        font: '11px system-ui, sans-serif',
        maxSize: new go.Size(320, NaN),
      }).bind('text', field),
    );
}

function createNodeTemplate(): go.Node {
  return new go.Node(go.PanelTypes.Spot, {
    locationSpot: go.Spot.Center,
    dragComputation: avoidNodeOverlap,
    // Only relationships can be removed; the node set stays fixed.
    deletable: false,
  })
    .bindTwoWay('location', 'loc', go.Point.parse, go.Point.stringify)
    .add(
      // The shape is the node's port. Only its rim is exposed, so a drag that
      // starts there draws a link, while a drag from anywhere else moves the node.
      new go.Shape({
        desiredSize: new go.Size(NODE_WIDTH, NODE_HEIGHT),
        stroke: '#374151',
        strokeWidth: 1.5,
        portId: '',
        fromLinkable: true,
        toLinkable: true,
        cursor: 'crosshair',
      })
        .bind('figure', 'shape')
        .bind('fill', 'color'),
      new go.Shape({
        desiredSize: new go.Size(NODE_WIDTH - 2 * LINK_RIM, NODE_HEIGHT - 2 * LINK_RIM),
        fill: 'transparent',
        stroke: null,
      }).bind('figure', 'shape'),
      new go.Panel(go.PanelTypes.Vertical).add(
        new go.TextBlock({
          ...ONE_LINE,
          font: 'bold 12px system-ui, sans-serif',
          editable: true,
          toolTip: fullTextHint('title'),
        })
          .bindTwoWay('text', 'title')
          .bind('maxSize', 'shape', textLimit(TITLE_REACH))
          .bind('stroke', 'color', textColorFor),
        new go.TextBlock({
          ...ONE_LINE,
          font: '10px system-ui, sans-serif',
          editable: true,
          toolTip: fullTextHint('subtitle'),
        })
          .bindTwoWay('text', 'subtitle')
          .bind('maxSize', 'shape', textLimit(SUBTITLE_REACH))
          .bind('stroke', 'color', textColorFor),
        new go.Panel(go.PanelTypes.Horizontal, { margin: new go.Margin(3, 0, 0, 0) }).add(
          createColorIcon(),
          createCommentIcon().set({ margin: new go.Margin(0, 0, 0, 7) }),
          createBatchIcon().set({ margin: new go.Margin(0, 0, 0, 7) }),
        ),
      ),
    );
}

const INFO_ICON = 'INFO';

/** The small "i" in the middle of a link. Clicks on it are handled in handleClicks. */
function createInfoIcon(): go.Panel {
  return new go.Panel(go.PanelTypes.Auto, { name: INFO_ICON, cursor: 'pointer' }).add(
    new go.Shape({
      figure: go.Figures.Circle,
      desiredSize: new go.Size(14, 14),
      fill: '#ffffff',
      stroke: '#2563eb',
      strokeWidth: 1,
    }),
    new go.TextBlock('i', { font: 'bold 10px Georgia, serif', stroke: '#2563eb' }),
  );
}

/** `object` or the nearest panel around it that is called `name`, if any. */
function findNamed(object: go.GraphObject | null, name: string): go.GraphObject | null {
  for (let o = object; o; o = o.panel) if (o.name === name) return o;
  return null;
}

/** What the component is told about clicks on the icons inside the diagram. */
export interface IconClicks {
  onLinkInfo: (link: LinkData) => void;
  onNodeColor: (node: NodeData) => void;
  onNodeComment: (node: NodeData) => void;
  onNodeBatch: (node: NodeData) => void;
}

/** A link whose line type follows `modelData.linkType`. */
function createLink(...parts: go.GraphObject[]): go.Link {
  // Drawn behind the nodes. Links can be selected and removed, but not reconnected.
  return new go.Link({ layerName: go.LayerNames.Background })
    .bindModel('routing', 'linkType', (type: LinkType) => linkStyle(type).routing)
    .bindModel('curve', 'linkType', (type: LinkType) => linkStyle(type).curve)
    .bindModel('corner', 'linkType', (type: LinkType) => linkStyle(type).corner)
    .add(
      // A wide invisible stroke along the same path, so thin lines are easy to click.
      new go.Shape({ isPanelMain: true, stroke: 'transparent', strokeWidth: 8 }),
      ...parts,
    );
}

// Only hierarchy links make up a node's tree (see highlightTree), and only they
// follow the sides that a tree layout assigns: a cross link attaches wherever
// suits its route.
const NOT_IN_TREE = { isTreeLink: false, fromSpot: go.Spot.None, toSpot: go.Spot.None };

function createLinkTemplates(): go.Map<string, go.Link> {
  return new go.Map<string, go.Link>([
    {
      key: 'hierarchy' satisfies LinkKind,
      value: createLink(
        new go.Shape({ isPanelMain: true, stroke: '#374151', strokeWidth: 1.5 }),
        new go.Shape({
          toArrow: go.Arrowheads.Standard,
          fill: '#374151',
          stroke: null,
          scale: 0.8,
        }),
        // A link label without a segment index sits at the middle of the route.
        createInfoIcon(),
      ),
    },
    {
      key: 'relation' satisfies LinkKind,
      value: createLink(
        new go.Shape({ isPanelMain: true, stroke: '#9ca3af', strokeWidth: 1 }),
        new go.Shape({
          toArrow: go.Arrowheads.Standard,
          fill: '#9ca3af',
          stroke: null,
          scale: 0.8,
        }),
        createInfoIcon(),
      ).set(NOT_IN_TREE),
    },
    {
      // Drawn by the user: the only dotted lines, and without an info icon.
      key: 'manual' satisfies LinkKind,
      value: createLink(
        new go.Shape({
          isPanelMain: true,
          stroke: '#2563eb',
          strokeWidth: 1.5,
          strokeDashArray: [2, 4],
        }),
        new go.Shape({
          toArrow: go.Arrowheads.Standard,
          fill: '#2563eb',
          stroke: null,
          scale: 0.8,
        }),
      ).set(NOT_IN_TREE),
    },
  ]);
}

export function createModel(
  data: { nodes: NodeData[]; links: LinkData[] },
  settings: ModelData,
): NodeModel {
  return new go.GraphLinksModel<NodeData, LinkData, ModelData>(data.nodes, data.links, {
    linkKeyProperty: 'key',
    modelData: { ...settings },
  });
}

/**
 * Click behaviour of the diagram:
 * - A click on a node's color, comment or batch icon, or on a link's info icon,
 *   reports it and leaves the selection alone. The info icon is looked up among everything
 *   under the pointer, because in a dense diagram other lines run across it
 *   and would otherwise take the click.
 * - Any other click on a node or line adds it to the selection, or takes it out
 *   again, which GoJS otherwise does only for Ctrl/Cmd-click. Clicking empty
 *   space still clears the selection.
 */
function handleClicks(diagram: go.Diagram, clicks: IconClicks): void {
  const tool = diagram.toolManager.clickSelectingTool;
  const standardMouseSelect = tool.standardMouseSelect;
  tool.standardMouseSelect = function (this: go.ClickSelectingTool): void {
    const input = this.diagram.lastInput;
    const point = input.documentPoint;

    const top = this.diagram.findObjectAt(point);
    const node = top?.part?.data as NodeData | undefined;
    if (node && findNamed(top, COLOR_ICON)) {
      clicks.onNodeColor(node);
      return;
    }
    if (node && findNamed(top, COMMENT_ICON)) {
      clicks.onNodeComment(node);
      return;
    }
    if (node && findNamed(top, BATCH_ICON)) {
      clicks.onNodeBatch(node);
      return;
    }

    const infoIcon = this.diagram.findObjectsAt(point, (o) => findNamed(o, INFO_ICON)).first();
    // An icon hidden underneath a node does not count: that click is for the node.
    const onNode = this.diagram.findPartAt(point, false) instanceof go.Node;
    if (infoIcon?.part?.data && !onNode) {
      clicks.onLinkInfo(infoIcon.part.data as LinkData);
      return;
    }

    if (this.diagram.findPartAt(point, true)) input.control = true;
    standardMouseSelect.call(this);
  };
}

export function createDiagram(div: HTMLDivElement, clicks: IconClicks): go.Diagram {
  const diagram = new go.Diagram(div, {
    nodeTemplate: createNodeTemplate(),
    linkTemplateMap: createLinkTemplates(),
    initialAutoScale: go.AutoScale.Uniform,
    contentAlignment: go.Spot.Center,
    padding: 30,
    // Animations would blur the undo/redo timings.
    'animationManager.isEnabled': false,
    allowCopy: false,
    allowInsert: false,
  });
  // A link dragged from the rim of one node to another node becomes a 'manual' link.
  diagram.toolManager.linkingTool.archetypeLinkData = { category: 'manual' satisfies LinkKind };
  handleClicks(diagram, clicks);
  diagram.addDiagramListener('SelectionMoved', (e) => rerouteLinksAcross(e.subject));
  return diagram;
}

/**
 * Lines are routed around the nodes only when their own ends move. So after a
 * drag, the lines that now run across a moved node are routed again. This
 * happens inside the drag's transaction and is undone with it.
 */
function rerouteLinksAcross(moved: go.Set<go.Part>): void {
  moved.each((part) => {
    if (!(part instanceof go.Node)) return;
    const b = part.actualBounds;
    part.diagram?.links.each((link) => {
      if (link.fromNode === part || link.toNode === part) return;
      const points = link.points;
      for (let i = 0; i < points.count - 1; i++) {
        const p = points.elt(i);
        const q = points.elt(i + 1);
        if (go.Rect.intersectsLineSegment(b.x, b.y, b.width, b.height, p.x, p.y, q.x, q.y)) {
          link.invalidateRoute();
          return;
        }
      }
    });
  });
}

/**
 * Adds `data` as a new node at the free place nearest to the middle of what is
 * currently on screen, and routes the lines that ran through that place around
 * it. Call this inside a transaction.
 */
export function addNodeInView(diagram: go.Diagram, data: NodeData): void {
  const spot = findFreeSpot(diagram, diagram.viewportBounds.center);
  data.loc = go.Point.stringify(spot);
  diagram.model.addNodeData(data);
  const node = diagram.findNodeForData(data);
  if (!node) return;
  node.ensureBounds();
  rerouteLinksAcross(new go.Set<go.Part>([node]));
}

/** The point nearest to `near` where a node can sit with clear space to every other node. */
function findFreeSpot(diagram: go.Diagram, near: go.Point): go.Point {
  const gap = 40;
  const stepX = NODE_WIDTH + gap;
  const stepY = NODE_HEIGHT + gap;
  const isFree = (x: number, y: number) => {
    const area = new go.Rect(x - stepX / 2, y - stepY / 2, stepX, stepY);
    return !diagram.nodes.any((node) => node.actualBounds.intersectsRect(area));
  };
  // Search outwards in square rings of node-sized steps around `near`.
  for (let ring = 0; ; ring++) {
    for (let i = -ring; i <= ring; i++) {
      for (let j = -ring; j <= ring; j++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== ring) continue;
        const x = near.x + i * stepX;
        const y = near.y + j * stepY;
        if (isFree(x, y)) return new go.Point(x, y);
      }
    }
  }
}

/** Opacity of everything outside the highlighted tree. */
const DIMMED = 0.15;

/**
 * Shows `node`, its ancestors up to the root and all of its descendants at full
 * strength and dims the rest of the diagram; with null, nothing is dimmed.
 * This is display only and never becomes part of the undo history.
 */
export function highlightTree(diagram: go.Diagram, node: go.Node | null): void {
  const tree = node && node.findTreeParts().addAll(node.findTreeParentChain());
  diagram.commit((d) => {
    const show = (part: go.Part) => (part.opacity = !tree || tree.has(part) ? 1 : DIMMED);
    d.nodes.each(show);
    d.links.each(show);
  }, null);
}

/** Shows `model` in the diagram with an empty, unlimited undo history. */
export function showModel(diagram: go.Diagram, model: NodeModel): void {
  diagram.model = model;
  // Configure the UndoManager only after the assignment: assigning a model
  // overwrites these settings with the ones of the model it replaces.
  model.undoManager.isEnabled = true;
  // The default of 999 drops the oldest transactions, which would make it
  // impossible to undo all the way back to the initial state.
  model.undoManager.maxHistoryLength = -1;
}
