// 'gojs/release/go' is always the production build. Plain 'gojs' resolves to the
// slower debug build under `ng serve`, which would inflate the timings.
import * as go from 'gojs/release/go';
import { LayoutType } from './layouts';
import { LinkType, linkStyle } from './link-types';
import { LinkData, LinkKind, NodeData, formatOwnership } from './node-data';

/** Model-wide settings. Kept in the model so that switching them is undone with everything else. */
export interface ModelData {
  layoutType: LayoutType;
  linkType: LinkType;
  /** What the user calls the diagram, and what they say about it. */
  name: string;
  description: string;
}

export type NodeModel = go.GraphLinksModel<NodeData, LinkData, ModelData>;

/** Picks a readable text colour for the given "#rrggbb" fill. */
export function textColorFor(fill: string): string {
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
/** Every node has a dark gray border. */
const NODE_BORDER = '#555555';
const NODE_WIDTH = 172;
const NODE_HEIGHT = 96;
/** Width of the band along the edge of a node from which a new link can be dragged. */
const LINK_RIM = 9;

// The content is a centred stack: title, subtitle, then the icon row. These are
// the distances from the node's centre line to the far edge of the two text rows.
const TITLE_REACH = 25;
const SUBTITLE_REACH = 11;
const TEXT_PADDING = 8;

/**
 * How far a figure reaches from its centre along one axis, at the distance
 * `offset` from the centre along the other axis. `reach` and `otherReach` are
 * half the figure's size along those two axes. For a capsule the first axis has
 * to be the horizontal one for the rounded ends to be taken into account.
 */
function figureExtent(
  figure: go.FigureName,
  reach: number,
  otherReach: number,
  offset: number,
): number {
  const t = Math.min(1, Math.abs(offset) / otherReach);
  switch (figure) {
    case go.Figures.Diamond:
      return reach * (1 - t);
    case go.Figures.Ellipse:
      return reach * Math.sqrt(1 - t * t);
    case go.Figures.Capsule: {
      // Two half circles of radius `r` joined by straight edges.
      const r = Math.min(reach, otherReach);
      if (reach >= otherReach) return reach - r + Math.sqrt(r * r - (t * otherReach) ** 2);
      const beyond = Math.abs(offset) - (otherReach - r);
      return beyond <= 0 ? reach : Math.sqrt(Math.max(0, r * r - beyond * beyond));
    }
    default:
      return reach;
  }
}

/**
 * Binding conversion from a node's shape to the widest a text row may be and
 * still stay inside that shape; a diamond is much narrower near its tips than
 * a rectangle. Longer text is cut off with an ellipsis.
 */
function textLimit(reach: number): (figure: go.FigureName) => go.Size {
  return (figure) =>
    new go.Size(
      Math.min(
        2 * figureExtent(figure, NODE_WIDTH / 2, NODE_HEIGHT / 2, reach) - TEXT_PADDING,
        NODE_WIDTH - 2 * ARROW_COLUMN,
      ),
      NaN,
    );
}

const ONE_LINE = { maxLines: 1, overflow: go.TextOverflow.Ellipsis };

const COLOR_ICON = 'COLOR';
const COMMENT_ICON = 'COMMENT';
const BATCH_ICON = 'BATCH';
const DELETE_ICON = 'DELETE';
const SELECTION_GOLD = '#d4a017';
const ARROWS = 'ARROWS';
const LINK_HANDLE = 'LINK_HANDLE';
/** Room kept free of text on either side of a node, for the two arrows on its left. */
const ARROW_COLUMN = 20;

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

/**
 * Binding conversion from a node's shape to the place of its delete icon: just
 * inside the top right of the outline. For a rectangle that is the corner of the
 * bounds; a diamond, an ellipse and a capsule do not reach that corner, so there
 * the icon sits further in, on the upper right of the shape itself.
 */
function deleteIconSpot(figure: go.FigureName): go.Spot {
  switch (figure) {
    case go.Figures.Diamond:
      return new go.Spot(0.62, 0.17);
    case go.Figures.Ellipse:
      return new go.Spot(0.76, 0.17);
    case go.Figures.Capsule:
      return new go.Spot(0.85, 0.17);
    default:
      return new go.Spot(1, 0, -10, 10);
  }
}

/**
 * Binding conversion from a node's shape to the place of its two arrows: at the
 * left, half way up. A diamond comes to a point there, so its arrows sit further in.
 */
function arrowsSpot(figure: go.FigureName): go.Spot {
  return new go.Spot(0, 0.5, figure === go.Figures.Diamond ? 30 : 14, 0);
}

/** The two arrows on the left of a node, one pointing up and one pointing down. */
function createArrows(): go.Panel {
  const arrow = (geometryString: string) =>
    new go.Shape({ geometryString, fill: '#ffffff', stroke: '#374151', strokeWidth: 1 });
  return new go.Panel(go.PanelTypes.Vertical, { name: ARROWS })
    .bind('alignment', 'shape', arrowsSpot)
    .add(
      arrow('F M6 1 L11 7 H8 V11 H4 V7 H1z'),
      arrow('F M6 11 L1 5 H4 V1 H8 V5 H11z').set({ margin: new go.Margin(4, 0, 0, 0) }),
    );
}

/** The centre of the delete icon, in pixels from the top left corner of a node of that shape. */
export function deleteIconCentre(figure: go.FigureName): { x: number; y: number } {
  const spot = deleteIconSpot(figure);
  return { x: spot.x * NODE_WIDTH + spot.offsetX, y: spot.y * NODE_HEIGHT + spot.offsetY };
}

/**
 * Binding conversion from a node's shape to the place of its link handle: at the
 * right, half way up. A diamond comes to a point there, so its handle sits further in.
 */
function linkHandleSpot(figure: go.FigureName): go.Spot {
  return new go.Spot(1, 0.5, figure === go.Figures.Diamond ? -24 : -12, 0);
}

/**
 * The dot on the right of a node from which a new relationship is dragged to
 * another node. Dragging from the very edge of a node works too, but that edge
 * is only a few pixels wide once the diagram is zoomed out.
 */
function createLinkHandle(): go.Panel {
  return new go.Panel(go.PanelTypes.Spot, {
    name: LINK_HANDLE,
    cursor: 'crosshair',
    toolTip: hint('Drag to another node to add a relationship'),
  })
    .bind('alignment', 'shape', linkHandleSpot)
    .add(
      // A larger invisible disc, so the handle can still be caught when it is drawn small.
      new go.Shape({
        figure: go.Figures.Circle,
        desiredSize: new go.Size(20, 20),
        fill: 'transparent',
        stroke: null,
      }),
      new go.Shape({
        figure: go.Figures.Circle,
        desiredSize: new go.Size(10, 10),
        fill: '#ffffff',
        stroke: '#374151',
        strokeWidth: 1.5,
      }),
    );
}

/** Lets a drag that starts on a node's link handle draw a relationship from that node. */
function linkFromHandle(diagram: go.Diagram): void {
  const tool = diagram.toolManager.linkingTool;
  const findLinkablePort = tool.findLinkablePort;
  tool.findLinkablePort = function (this: go.LinkingTool): go.GraphObject | null {
    const hit = this.diagram.findObjectAt(this.diagram.firstInput.documentPoint);
    if (hit?.part instanceof go.Node && findNamed(hit, LINK_HANDLE)) return hit.part.port;
    return findLinkablePort.call(this);
  };
}

/** The x at the top right of a node. Clicks on it are handled in handleClicks. */
function createDeleteIcon(): go.Panel {
  return new go.Panel(go.PanelTypes.Auto, {
    name: DELETE_ICON,
    cursor: 'pointer',
    toolTip: hint('Delete node'),
  })
    .bind('alignment', 'shape', deleteIconSpot)
    .add(
      new go.Shape({
        figure: go.Figures.Circle,
        desiredSize: new go.Size(13, 13),
        fill: '#ffffff',
        stroke: '#9ca3af',
        strokeWidth: 1,
      }),
      new go.Shape({
        figure: go.Figures.XLine,
        desiredSize: new go.Size(5, 5),
        stroke: '#6b7280',
        strokeWidth: 1.5,
      }),
    );
}

/**
 * How a node is marked, both when it is selected and when it belongs to the
 * highlighted tree: a gold outline in the node's own shape, not a rectangle.
 */
function createGoldOutline(strokeWidth = 4): go.Adornment {
  return new go.Adornment(go.PanelTypes.Auto).add(
    new go.Shape({ fill: null, stroke: SELECTION_GOLD, strokeWidth }).bind('figure', 'shape'),
    new go.Placeholder(),
  );
}

/** Category under which the gold outline of a highlighted node is registered as an adornment of it. */
const FOCUS_ADORNMENT = 'Focus';
const FOCUS_OUTLINE_TEMPLATE = createGoldOutline();

/** Category of the outline around the node that a search has stepped to; thicker than the others. */
const SEARCH_ADORNMENT = 'Search';
const SEARCH_OUTLINE_TEMPLATE = createGoldOutline(7);

function createNodeTemplate(): go.Node {
  return new go.Node(go.PanelTypes.Spot, {
    locationSpot: go.Spot.Center,
    dragComputation: avoidNodeOverlap,
    selectionAdornmentTemplate: createGoldOutline(),
  })
    .bindTwoWay('location', 'loc', go.Point.parse, go.Point.stringify)
    .add(
      // The shape is the node's port. Only its rim is exposed, so a drag that
      // starts there draws a link, while a drag from anywhere else moves the node.
      new go.Shape({
        desiredSize: new go.Size(NODE_WIDTH, NODE_HEIGHT),
        stroke: NODE_BORDER,
        strokeWidth: 1.5,
        portId: '',
        fromLinkable: true,
        toLinkable: true,
        // Two funds can be related in more than one way, so a second line between
        // the same two nodes may be drawn.
        fromLinkableDuplicates: true,
        toLinkableDuplicates: true,
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
        // A thin rule between the text and the icons.
        new go.Shape({
          figure: go.Figures.LineH,
          desiredSize: new go.Size(72, 1),
          strokeWidth: 1,
          opacity: 0.35,
          margin: new go.Margin(3, 0, 0, 0),
        }).bind('stroke', 'color', textColorFor),
        new go.Panel(go.PanelTypes.Horizontal, { margin: new go.Margin(3, 0, 0, 0) }).add(
          createColorIcon(),
          createCommentIcon().set({ margin: new go.Margin(0, 0, 0, 7) }),
          createBatchIcon().set({ margin: new go.Margin(0, 0, 0, 7) }),
        ),
      ),
      createDeleteIcon(),
      createArrows(),
      createLinkHandle(),
    );
}

const INFO_ICON = 'INFO';
/** Category under which a link's info icon is registered as an adornment of it. */
const INFO_ADORNMENT = 'Info';
/** Layer of the info icons: above every line, below the nodes. */
const INFO_LAYER = 'LinkInfo';

/** The small "i" in the middle of a link. Clicks on it are handled in handleClicks. */
function createInfoIcon(): go.Adornment {
  return new go.Adornment(go.PanelTypes.Auto, {
    name: INFO_ICON,
    layerName: INFO_LAYER,
    locationSpot: go.Spot.Center,
    cursor: 'pointer',
    toolTip: hint('Relationship details'),
  }).add(
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

const INFO_ICON_TEMPLATE = createInfoIcon();

/** Category under which a link's ownership percentage is registered as an adornment of it. */
const OWNERSHIP_ADORNMENT = 'Ownership';
const OWNERSHIP_TEXT = 'OWNERSHIP';
/** Name of the arrowhead shape in every link template. */
const ARROWHEAD = 'ARROW';
/** Free space between the percentage and the node the line ends at, and the line itself. */
const OWNERSHIP_GAP_TO_NODE = 6;
const OWNERSHIP_GAP_TO_LINE = 3;

/** The percentage at the end of a line: how much of the fund it points at is owned. */
function createOwnershipLabel(): go.Adornment {
  return new go.Adornment(go.PanelTypes.Auto, {
    layerName: INFO_LAYER,
    locationSpot: go.Spot.Center,
    pickable: false,
  }).add(
    new go.Shape({ fill: 'rgba(255, 255, 255, 0.85)', stroke: null }),
    new go.TextBlock({
      name: OWNERSHIP_TEXT,
      margin: new go.Margin(0, 2),
      font: 'bold 10px system-ui, sans-serif',
      stroke: '#166534',
    }),
  );
}

const OWNERSHIP_LABEL_TEMPLATE = createOwnershipLabel();

/**
 * A relationship line, with an info icon at the middle of its route and, where
 * it is known, the ownership percentage near its end.
 *
 * Icon and percentage are not elements of the link. Lines often share a stretch
 * of their route, and a part is drawn as a whole, so anything inside the link
 * would end up underneath the lines of the links drawn after it. As adornments
 * they live in a layer of their own, above all lines, and GoJS keeps them with
 * their link: they are hidden and removed together with it and never enter the
 * undo history.
 */
class RelationshipLink extends go.Link {
  private get linkData(): LinkData | null {
    return this.data as LinkData | null;
  }

  /**
   * Makes both ends of the line touch the outline of their node. GoJS ends an
   * orthogonal line on the node's bounding rectangle, which leaves a gap in front
   * of a diamond, an ellipse or a capsule. The route itself is left alone, since
   * GoJS's routers rewrite it; instead the drawn line is lengthened by the size of
   * the gap at each end, and the arrowhead is pushed forward by the same amount.
   */
  private closeGaps(): void {
    const diagram = this.diagram;
    if (!diagram) return;
    const last = this.pointsCount - 1;
    const ortho = this.isOrthogonal;
    const fromGap = ortho ? this.gapToOutline(this.getPoint(0), this.fromNode, this.fromPort) : 0;
    const toGap = ortho ? this.gapToOutline(this.getPoint(last), this.toNode, this.toPort) : 0;
    const arrow = this.findObject(ARROWHEAD);
    // A link starts out with NaN, which means "let GoJS decide", so compare with care.
    const same = (current: number, wanted: number) => Math.abs((current || 0) - wanted) <= 0.1;
    if (same(this.fromShortLength, -fromGap) && same(this.toShortLength, -toGap)) return;

    // Display only: these follow from the route and the shapes, and are not undo steps.
    const skips = diagram.skipsUndoManager;
    diagram.skipsUndoManager = true;
    this.fromShortLength = -fromGap;
    this.toShortLength = -toGap;
    if (arrow) arrow.segmentOffset = new go.Point(toGap, 0);
    diagram.skipsUndoManager = skips;
  }

  /**
   * How far it is from this end point, on the bounding rectangle of the node, to
   * the outline of the node's shape, measured in the direction the line travels.
   */
  private gapToOutline(point: go.Point, node: go.Node | null, port: go.GraphObject | null): number {
    const figure = (node?.data as NodeData | null)?.shape;
    if (!figure || !port) return 0;
    const bounds = port.getDocumentBounds();
    const a = bounds.width / 2;
    const b = bounds.height / 2;
    const onSide = (distance: number) => Math.abs(distance) < 1;
    if (onSide(point.y - bounds.top) || onSide(point.y - bounds.bottom)) {
      // Arriving from above or below.
      return b - figureExtent(figure, b, a, point.x - bounds.centerX);
    }
    if (onSide(point.x - bounds.left) || onSide(point.x - bounds.right)) {
      return a - figureExtent(figure, a, b, point.y - bounds.centerY);
    }
    return 0;
  }

  /** Called by GoJS whenever the link is drawn anew, for instance after its route changed. */
  override updateAdornments(): void {
    super.updateAdornments();
    if (this.pointsCount < 2) return;
    this.closeGaps();
    // Links drawn by the user have no icon.
    if (this.linkData?.category !== ('manual' satisfies LinkKind)) {
      const icon = this.adornment(INFO_ADORNMENT, INFO_ICON_TEMPLATE);
      icon.location = this.midPoint;
      icon.opacity = this.opacity;
    }
    if (this.linkData?.ownership !== undefined) {
      const label = this.adornment(OWNERSHIP_ADORNMENT, OWNERSHIP_LABEL_TEMPLATE);
      const text = label.findObject(OWNERSHIP_TEXT);
      if (text instanceof go.TextBlock) text.text = formatOwnership(this.linkData.ownership);
      label.ensureBounds();
      label.location = this.ownershipLabelPoint(label.actualBounds);
      label.opacity = this.opacity;
    }
  }

  /** This link's adornment of that category, made from the template on first use. */
  private adornment(category: string, template: go.Adornment): go.Adornment {
    let adornment = this.findAdornment(category);
    if (!adornment) {
      adornment = template.copy();
      adornment.adornedObject = this.path;
      this.addAdornment(category, adornment);
    }
    return adornment;
  }

  /**
   * Where the centre of the percentage goes: beside the last stretch of the line,
   * and far enough back from its end that the whole label stays clear of the node.
   */
  private ownershipLabelPoint(label: go.Rect): go.Point {
    const end = this.getPoint(this.pointsCount - 1);
    const before = this.getPoint(this.pointsCount - 2);
    const length = Math.hypot(end.x - before.x, end.y - before.y) || 1;
    const ux = (end.x - before.x) / length;
    const uy = (end.y - before.y) / length;
    // Half of the label's size along the line and across it.
    const along = (Math.abs(ux) * label.width + Math.abs(uy) * label.height) / 2;
    const across = (Math.abs(uy) * label.width + Math.abs(ux) * label.height) / 2;
    const back = along + OWNERSHIP_GAP_TO_NODE;
    const aside = across + OWNERSHIP_GAP_TO_LINE;
    return new go.Point(end.x - ux * back - uy * aside, end.y - uy * back + ux * aside);
  }
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
  onNodeDelete: (node: NodeData) => void;
}

/** A link whose line type follows `modelData.linkType`. */
function createLink(...parts: go.GraphObject[]): go.Link {
  // Drawn behind the nodes. Links can be selected and removed, but not reconnected.
  return new RelationshipLink({ layerName: go.LayerNames.Background })
    .bindModel('routing', 'linkType', (type: LinkType) => linkStyle(type).routing)
    .bindModel('curve', 'linkType', (type: LinkType) => linkStyle(type).curve)
    .bindModel('corner', 'linkType', (type: LinkType) => linkStyle(type).corner)
    .add(
      // A wide invisible stroke along the same path, so thin lines are easy to click.
      new go.Shape({ isPanelMain: true, stroke: 'transparent', strokeWidth: 8 }),
      ...parts,
    );
}

/** Every relationship line is black; the kinds differ in thickness and dashing only. */
const LINE_COLOR = '#000000';
/** Name of the visible line in every link template (there is a wide invisible one for clicking too). */
const LINE = 'LINE';

// Only hierarchy links make up a node's tree (see highlightTree), and only they
// follow the sides that a tree layout assigns: a cross link attaches wherever
// suits its route.
const NOT_IN_TREE = { isTreeLink: false, fromSpot: go.Spot.None, toSpot: go.Spot.None };

function createLinkTemplates(): go.Map<string, go.Link> {
  return new go.Map<string, go.Link>([
    {
      key: 'hierarchy' satisfies LinkKind,
      value: createLink(
        new go.Shape({ name: LINE, isPanelMain: true, stroke: LINE_COLOR, strokeWidth: 1.5 }),
        new go.Shape({
          name: ARROWHEAD,
          toArrow: go.Arrowheads.Standard,
          fill: LINE_COLOR,
          stroke: null,
          scale: 0.8,
        }),
      ),
    },
    {
      key: 'relation' satisfies LinkKind,
      value: createLink(
        new go.Shape({ name: LINE, isPanelMain: true, stroke: LINE_COLOR, strokeWidth: 1 }),
        new go.Shape({
          name: ARROWHEAD,
          toArrow: go.Arrowheads.Standard,
          fill: LINE_COLOR,
          stroke: null,
          scale: 0.8,
        }),
      ).set(NOT_IN_TREE),
    },
    {
      // Drawn by the user: the only dotted lines, and without an info icon.
      key: 'manual' satisfies LinkKind,
      value: createLink(
        new go.Shape({
          name: LINE,
          isPanelMain: true,
          stroke: LINE_COLOR,
          strokeWidth: 1.5,
          strokeDashArray: [2, 4],
        }),
        new go.Shape({
          name: ARROWHEAD,
          toArrow: go.Arrowheads.Standard,
          fill: LINE_COLOR,
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
 * - A click on a node's color, comment, batch or delete icon, or on a link's info icon,
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
    if (node && findNamed(top, DELETE_ICON)) {
      clicks.onNodeDelete(node);
      return;
    }

    const infoIcon = findNamed(top, INFO_ICON)?.part;
    const link = infoIcon instanceof go.Adornment ? infoIcon.adornedPart?.data : null;
    if (link) {
      clicks.onLinkInfo(link as LinkData);
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
  // Info icons go between the lines (Background layer) and the nodes (default layer).
  // The layer is temporary: what is in it is display only and is never recorded for undo.
  diagram.addLayerBefore(
    new go.Layer({ name: INFO_LAYER, isTemporary: true }),
    diagram.findLayer('')!,
  );
  // A link dragged from the rim of one node to another node becomes a 'manual' link.
  diagram.toolManager.linkingTool.archetypeLinkData = { category: 'manual' satisfies LinkKind };
  handleClicks(diagram, clicks);
  linkFromHandle(diagram);
  diagram.addDiagramListener('SelectionMoved', (e) => rerouteLinksAcross(e.subject));
  // Lines are drawn up to the outline of a node, so when a node changes shape
  // its lines have to be measured again.
  diagram.addModelChangedListener((e) => {
    if (e.change !== go.ChangeType.Property || e.propertyName !== 'shape' || !e.object) return;
    diagram
      .findNodeForData(e.object)
      ?.findLinksConnected()
      .each((link) => link.updateAdornments());
  });
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

/**
 * Everything that belongs in a picture of the diagram: the nodes, the lines, and
 * the lines' info icons and percentages, but not the marks of selection and highlight.
 */
export function picturedParts(diagram: go.Diagram): go.List<go.Part> {
  const parts = new go.List<go.Part>();
  diagram.nodes.each((node) => parts.add(node));
  diagram.links.each((link) => {
    parts.add(link);
    for (const category of [INFO_ADORNMENT, OWNERSHIP_ADORNMENT]) {
      const adornment = link.findAdornment(category);
      if (adornment) parts.add(adornment);
    }
  });
  return parts;
}

/**
 * Marks `node` as the search result that is being looked at, with a thick gold
 * outline, and brings it into view at a readable size; with null, the mark is
 * taken away. Display only: nothing here becomes part of the undo history.
 */
export function showSearchHit(diagram: go.Diagram, node: go.Node | null): void {
  // No transaction here: this is also called while GoJS is finishing one, and
  // adornments are never recorded for undo anyway.
  diagram.nodes.each((part) => {
    if (part !== node) part.removeAdornment(SEARCH_ADORNMENT);
  });
  if (!node) return;
  if (!node.findAdornment(SEARCH_ADORNMENT)) {
    const outline = SEARCH_OUTLINE_TEMPLATE.copy();
    outline.adornedObject = node;
    (outline.elt(0) as go.Shape).figure = (node.data as NodeData).shape;
    node.addAdornment(SEARCH_ADORNMENT, outline);
  }
  // Zoom in if the diagram is shown smaller than life size; never zoom out.
  if (diagram.scale < 1) diagram.scale = 1;
  diagram.centerRect(node.actualBounds);
}

/** Opacity of everything outside the highlighted tree. */
const DIMMED = 0.15;

/**
 * Shows `node`, its ancestors up to the root, all of its descendants, and the
 * nodes it is joined to by a relationship the user drew, at full strength, each
 * with a gold outline, and dims the rest of the diagram; with null, nothing is
 * dimmed or outlined.
 * This is display only and never becomes part of the undo history.
 */
export function highlightTree(diagram: go.Diagram, node: go.Node | null): void {
  const tree = node && node.findTreeParts().addAll(node.findTreeParentChain());
  // The relationships the user drew from or to this node count as well, with the nodes at their other end.
  node?.findLinksConnected().each((link) => {
    if ((link.data as LinkData | null)?.category !== ('manual' satisfies LinkKind)) return;
    tree?.add(link);
    const other = link.getOtherNode(node);
    if (other) tree?.add(other);
  });
  diagram.commit((d) => {
    const show = (part: go.Part) => {
      part.opacity = !tree || tree.has(part) ? 1 : DIMMED;
      // A link's icon and percentage are parts of their own and have to be dimmed with it.
      for (const category of [INFO_ADORNMENT, OWNERSHIP_ADORNMENT]) {
        const adornment = part.findAdornment(category);
        if (adornment) adornment.opacity = part.opacity;
      }
    };
    d.links.each(show);
    d.nodes.each((part) => {
      show(part);
      // Every node of the tree gets the gold outline, not just the selected one.
      if (!tree?.has(part)) {
        part.removeAdornment(FOCUS_ADORNMENT);
      } else if (!part.findAdornment(FOCUS_ADORNMENT)) {
        const outline = FOCUS_OUTLINE_TEMPLATE.copy();
        outline.adornedObject = part;
        (outline.elt(0) as go.Shape).figure = (part.data as NodeData).shape;
        part.addAdornment(FOCUS_ADORNMENT, outline);
      }
    });
  }, null);
}

/**
 * A small picture of the whole diagram, in `div`, with a box showing which part
 * of it is on screen. Dragging the box, or clicking elsewhere in the picture,
 * moves the view of the diagram itself.
 */
export function createOverview(div: HTMLDivElement, diagram: go.Diagram): go.Overview {
  const overview = new go.Overview(div, {
    observed: diagram,
    contentAlignment: go.Spot.Center,
    'animationManager.isEnabled': false,
  });
  const frame = overview.box.elt(0) as go.Shape;
  frame.stroke = SELECTION_GOLD;
  frame.strokeWidth = 2;
  return overview;
}

/** How long one node takes to appear, and the longest the whole reveal may take. */
const REVEAL_STEP_MS = 40;
const REVEAL_MAX_MS = 1500;
/** How long after that everything is shown anyway, if no frames were drawn. */
const REVEAL_GRACE_MS = 500;

/**
 * Makes the nodes of a freshly loaded diagram appear one after another, each
 * relationship as soon as both of its ends are there, and calls `done` when
 * everything is shown. Until then the diagram does not react to the mouse or
 * the keyboard. A big diagram shows several nodes per frame, so that the whole
 * reveal never takes longer than REVEAL_MAX_MS.
 *
 * Nothing is animated, and `done` is called at once, when the page is hidden
 * (no frames are drawn then) or the user has asked for reduced motion.
 * Returns a function that stops a reveal that is still running.
 */
export function revealNodesOneByOne(diagram: go.Diagram, done: () => void): () => void {
  const reducedMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const nodes: go.Node[] = [];
  diagram.nodes.each((node) => nodes.push(node));
  if (document.hidden || reducedMotion || nodes.length === 0) {
    done();
    return () => undefined;
  }

  // Display only: none of this is recorded for undo.
  const withoutUndo = (work: () => void) => {
    const skips = diagram.skipsUndoManager;
    diagram.skipsUndoManager = true;
    work();
    diagram.skipsUndoManager = skips;
  };
  const show = (part: go.Part, visible: boolean) => {
    part.opacity = visible ? 1 : 0;
    for (const category of [INFO_ADORNMENT, OWNERSHIP_ADORNMENT]) {
      const adornment = part.findAdornment(category);
      if (adornment) adornment.opacity = part.opacity;
    }
  };

  diagram.isEnabled = false;
  withoutUndo(() => {
    nodes.forEach((node) => show(node, false));
    diagram.links.each((link) => show(link, false));
  });

  const duration = Math.min(REVEAL_MAX_MS, nodes.length * REVEAL_STEP_MS);
  const start = performance.now();
  let shown = 0;
  let frame = 0;
  let timer = 0;
  const stop = () => {
    cancelAnimationFrame(frame);
    clearTimeout(timer);
  };
  const step = (all = false): void => {
    const progress = all ? 1 : Math.min(1, (performance.now() - start) / duration);
    const target = Math.max(shown + 1, Math.ceil(progress * nodes.length));
    withoutUndo(() => {
      for (; shown < Math.min(target, nodes.length); shown++) {
        const node = nodes[shown];
        show(node, true);
        node.findLinksConnected().each((link) => {
          if (link.getOtherNode(node)?.opacity === 1) show(link, true);
        });
      }
    });
    if (shown < nodes.length) {
      frame = requestAnimationFrame(() => step());
      return;
    }
    stop();
    diagram.isEnabled = true;
    done();
  };
  frame = requestAnimationFrame(() => step());
  // No frames are drawn while the page is in the background. The diagram must not
  // stay disabled because of that, so a timer shows whatever is still missing.
  timer = window.setTimeout(() => step(true), duration + REVEAL_GRACE_MS);
  return stop;
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
