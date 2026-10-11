// 'gojs/release/go' is always the production build. Plain 'gojs' resolves to the
// slower debug build under `ng serve`, which would inflate the timings.
import * as go from 'gojs/release/go';
import { LayoutType } from './layouts';
import { withoutUndo } from './history.service';
import { LinkType, linkStyle, routingFor } from './link-types';
import { LinkData, LinkKind, NodeData, formatOwnership } from './node-data';
import {
  DIMMED_OPACITY,
  HOVER_COLOR,
  LINE_COLOR,
  NODE_BORDER,
  OWNERSHIP_COLOR,
  REVEAL_GRACE_MS,
  REVEAL_LARGE_FROM,
  REVEAL_LARGE_MS,
  REVEAL_MAX_MS,
  REVEAL_STEP_MS,
  SELECTION_GOLD,
  StyleFieldId,
} from './constants';

/** Model-wide settings. Kept in the model so that switching them is undone with everything else. */
export interface ModelData {
  layoutType: LayoutType;
  linkType: LinkType;
  /** What the user calls the diagram, and what they say about it. */
  name: string;
  description: string;
  /**
   * Whether every relationship shows its card ("expand all"). It is part of the
   * model because the nodes stand further apart while it is on: undoing the
   * expansion has to bring back both the old positions and the hidden cards.
   */
  cardsExpanded: boolean;
  /**
   * The legal entity field whose value every node shows as its subtitle; null
   * while none is shown, which is how a diagram starts. It is chosen in the
   * styles dialog and is part of the model, so that undo and redo reach it.
   */
  subtitleField: StyleFieldId | null;
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

/**
 * A text of one line that ends in "…" where it does not fit. It is cut in the
 * middle of a word if need be: cut between words only, "Silverlake
 * Multi-Strategy 17" would show as "Silverlake…" and leave half the line empty.
 */
const ONE_LINE = {
  maxLines: 1,
  overflow: go.TextOverflow.Ellipsis,
  wrap: go.Wrap.BreakAll,
};
/** The title and subtitle of a node: one line each, centred in the node, also when cut off. */
const NODE_TEXT = { ...ONE_LINE, textAlign: 'center' as const };

const COLOR_ICON = 'COLOR';
const COMMENT_ICON = 'COMMENT';
const BATCH_ICON = 'BATCH';
const DELETE_ICON = 'DELETE';
const ARROWS = 'ARROWS';
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
 * How near to the edge of a node a drag may start and still draw a relationship:
 * this many pixels on screen, whatever the zoom. A diagram that is zoomed to fit
 * is often drawn at a third of its size, where the rim that GoJS itself offers
 * for this is three pixels wide and easily missed.
 */
const EDGE_REACH_PX = 8;
/**
 * Outside a node, the reach is never more than this many diagram units: far
 * enough to be caught, and less than half the gap to the next node.
 */
const EDGE_REACH_OUTSIDE = 20;
/**
 * Inside a node, the reach is never more than this many diagram units. A drag
 * that starts on a node is far more often meant to move it, so only a thin rim
 * along the edge draws a relationship and all the rest of the node moves it. To
 * draw one in a diagram that is zoomed far out, start on the edge or just
 * outside it.
 */
const EDGE_REACH_INSIDE = 9;

/** How far a point is from the edge of a rectangle; inside it, from the nearest side. */
function distanceToEdge(bounds: go.Rect, point: go.Point): number {
  const dx = Math.max(bounds.left - point.x, 0, point.x - bounds.right);
  const dy = Math.max(bounds.top - point.y, 0, point.y - bounds.bottom);
  if (dx > 0 || dy > 0) return Math.hypot(dx, dy);
  return Math.min(
    point.x - bounds.left,
    bounds.right - point.x,
    point.y - bounds.top,
    bounds.bottom - point.y,
  );
}

/**
 * The node whose edge is near enough to this point of the diagram for a drag
 * from there to draw a relationship; null when there is none. A point on one
 * node never reaches the edge of another.
 */
function nodeWithEdgeNear(diagram: go.Diagram, point: go.Point): go.Node | null {
  const onScreen = EDGE_REACH_PX / diagram.scale;
  const hitPart = diagram.findObjectAt(point)?.part;
  const over = hitPart instanceof go.Adornment ? hitPart.adornedPart : hitPart;
  if (over instanceof go.Node) {
    const rim = Math.min(EDGE_REACH_INSIDE, onScreen);
    return distanceToEdge(over.actualBounds, point) <= rim ? over : null;
  }
  const reach = Math.min(EDGE_REACH_OUTSIDE, onScreen);
  let nearest: go.Node | null = null;
  let distance = reach;
  diagram.findPartsNear(point, reach, true).each((part) => {
    if (!(part instanceof go.Node)) return;
    const d = distanceToEdge(part.actualBounds, point);
    if (d <= distance) {
      nearest = part;
      distance = d;
    }
  });
  return nearest;
}

/** Lets a drag that starts at or near the edge of a node draw a relationship from that node. */
function linkFromEdge(diagram: go.Diagram): void {
  const tool = diagram.toolManager.linkingTool;
  const findLinkablePort = tool.findLinkablePort;
  tool.findLinkablePort = function (this: go.LinkingTool): go.GraphObject | null {
    const node = nodeWithEdgeNear(this.diagram, this.diagram.firstInput.documentPoint);
    return node ? node.port : findLinkablePort.call(this);
  };
  // GoJS ends a new line at the nearest node it may go to within 100 units of
  // where the mouse is let go. Dropped on a node it may not go to, the line would
  // then jump to a neighbour of that node. Nodes are at least 60 units apart, so
  // with this reach it can only end at the node it was dropped on or next to.
  tool.portGravity = 20;
  // Two funds that already have a relationship, whichever way it points and
  // whoever made it, do not get a second one drawn between them.
  tool.linkValidation = (from, _fromPort, to) =>
    !from || !to || from.findLinksBetween(to).count === 0;
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
    new go.Shape({
      fill: null,
      stroke: SELECTION_GOLD,
      strokeWidth,
      // By default an ellipse, a diamond or a capsule is drawn big enough to hold
      // the node's bounding rectangle inside its curve, which leaves a gap around
      // the node. With these the outline is exactly as big as the node, as a
      // rectangle's always was.
      spot1: go.Spot.TopLeft,
      spot2: go.Spot.BottomRight,
    }).bind('figure', 'shape'),
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
          ...NODE_TEXT,
          font: 'bold 12px system-ui, sans-serif',
          // Not editable on the node: a press on the text is for selecting and
          // moving the node. The title is changed in the side panel.
          toolTip: fullTextHint('title'),
        })
          .bind('text', 'title')
          .bind('maxSize', 'shape', textLimit(TITLE_REACH))
          .bind('stroke', 'color', textColorFor),
        new go.TextBlock({
          ...NODE_TEXT,
          font: '10px system-ui, sans-serif',
          toolTip: fullTextHint('subtitle'),
        })
          .bind('text', 'subtitle')
          // Shown only once a legal entity field was chosen in the styles dialog.
          .bindModel(
            'visible',
            'subtitleField',
            (field: StyleFieldId | null | undefined) => !!field,
          )
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
/** Room between two percentages that stand one behind the other along the same line. */
const OWNERSHIP_GAP_TO_LABEL = 3;

/** The percentage at the end of a line: how much of the fund it points at is owned. */
function createOwnershipLabel(): go.Adornment {
  return new go.Adornment(go.PanelTypes.Auto, {
    layerName: INFO_LAYER,
    locationSpot: go.Spot.Center,
    pickable: false,
  }).add(
    // No background: the figure stands directly on the canvas.
    new go.Shape({ fill: null, stroke: null }),
    new go.TextBlock({
      name: OWNERSHIP_TEXT,
      margin: new go.Margin(0, 2),
      font: 'bold 10px system-ui, sans-serif',
      stroke: OWNERSHIP_COLOR,
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
/** Category of the small card with a relationship's data that "expand all" shows beside every info icon. */
const CARD_ADORNMENT = 'Card';
/** The cards are drawn above the nodes and above selection marks, so that nothing hides what a card says. */
const CARD_LAYER = 'LinkCards';
const CARD_TYPE = 'CARD_TYPE';
const CARD_FROM = 'CARD_FROM';
const CARD_TO = 'CARD_TO';
const CARD_OWNERSHIP = 'CARD_OWNERSHIP';
const CARD_FRAME = 'CARD_FRAME';
const CARD_FILL = '#ffffff';
const CARD_BORDER = '#9ca3af';
/** The card of a line that is selected: a gold border on a faint gold ground. */
const CARD_FILL_SELECTED = '#fff8e1';
/** How far a card is moved along its line at a time when its place is taken. */
const CARD_STEP = 24;
/** How many such steps are tried in each direction before the card has to overlap something. */
const CARD_STEPS = 80;
/** How far from its info icon a card may be put when its whole line is hemmed in by nodes. */
const CARD_SEARCH_RADIUS = 480;
/** Room left between a card and whatever it is kept clear of. */
const CARD_CLEARANCE = 3;
/** Everything that a relationship line carries with it: its icon, its percentage and its card. */
const LINK_ADORNMENTS = [INFO_ADORNMENT, OWNERSHIP_ADORNMENT, CARD_ADORNMENT];

/**
 * The card of one relationship: what kind it is, the two funds it joins and the
 * ownership. It is part of the drawing, so it grows and shrinks with the zoom and
 * stays in proportion to the nodes, however many cards are shown.
 */
function createLinkCard(): go.Adornment {
  const line = (name: string, font: string, stroke: string) =>
    new go.TextBlock({ ...ONE_LINE, name, font, stroke, maxSize: new go.Size(150, NaN) });
  return new go.Adornment(go.PanelTypes.Auto, {
    layerName: CARD_LAYER,
    // A card stands on its line, where the info icon is.
    locationSpot: go.Spot.Center,
    // Clicks go through a card to whatever lies under it.
    pickable: false,
  }).add(
    new go.Shape({
      name: CARD_FRAME,
      figure: go.Figures.RoundedRectangle,
      parameter1: 4,
      fill: CARD_FILL,
      stroke: CARD_BORDER,
      // The same width whether highlighted or not, so that a click never moves a card.
      strokeWidth: 1.5,
    }),
    new go.Panel(go.PanelTypes.Vertical, {
      margin: new go.Margin(4, 6),
      defaultAlignment: go.Spot.Left,
    }).add(
      line(CARD_TYPE, 'bold 9px system-ui, sans-serif', '#111827'),
      line(CARD_FROM, '9px system-ui, sans-serif', '#374151'),
      line(CARD_TO, '9px system-ui, sans-serif', '#374151'),
      line(CARD_OWNERSHIP, 'bold 9px system-ui, sans-serif', OWNERSHIP_COLOR),
    ),
  );
}

const LINK_CARD_TEMPLATE = createLinkCard();

/** The diagrams in which cards are currently drawn, to know when there are some to take away. */
const cardsDrawnIn = new WeakSet<go.Diagram>();

/** Whether the cards of all relationships are shown in this diagram: the model says so. */
export function allLinkCardsShown(diagram: go.Diagram): boolean {
  return (diagram.model.modelData as Partial<ModelData>).cardsExpanded === true;
}

/**
 * Makes the cards agree with what the model says: every relationship that has
 * an info icon gets its card, or all cards are taken away. The diagram calls
 * this itself whenever `cardsExpanded` changes, also by an undo or a redo.
 */
export function refreshLinkCards(diagram: go.Diagram): void {
  if (allLinkCardsShown(diagram)) cardsDrawnIn.add(diagram);
  else cardsDrawnIn.delete(diagram);
  diagram.links.each((link) => link.updateAdornments());
  placeLinkCards(diagram);
}

/**
 * Rectangles that can be asked quickly whether a new one would overlap any of
 * them. They are sorted into the squares of a coarse grid, so a question only
 * looks at the few rectangles nearby, also in a diagram with thousands of them.
 */
class RectIndex {
  private readonly cells = new Map<string, go.Rect[]>();
  private static readonly CELL = 240;

  private keysOf(rect: go.Rect): string[] {
    const size = RectIndex.CELL;
    const keys: string[] = [];
    for (let x = Math.floor(rect.left / size); x <= Math.floor(rect.right / size); x++) {
      for (let y = Math.floor(rect.top / size); y <= Math.floor(rect.bottom / size); y++) {
        keys.push(`${x}:${y}`);
      }
    }
    return keys;
  }

  add(rect: go.Rect): void {
    for (const key of this.keysOf(rect)) {
      const cell = this.cells.get(key);
      if (cell) cell.push(rect);
      else this.cells.set(key, [rect]);
    }
  }

  overlaps(rect: go.Rect): boolean {
    return this.keysOf(rect).some((key) =>
      (this.cells.get(key) ?? []).some((other) => other.intersectsRect(rect)),
    );
  }
}

/**
 * Every place within CARD_SEARCH_RADIUS of a point, on a fine grid, nearest
 * first. The gaps between nodes are only a little wider than a card, so a
 * coarser search could step right over the one place that fits.
 */
const NEARBY_OFFSETS: readonly (readonly [number, number])[] = (() => {
  const step = CARD_STEP / 2;
  const offsets: [number, number][] = [];
  for (let dx = -CARD_SEARCH_RADIUS; dx <= CARD_SEARCH_RADIUS; dx += step) {
    for (let dy = -CARD_SEARCH_RADIUS; dy <= CARD_SEARCH_RADIUS; dy += step) {
      if (Math.hypot(dx, dy) <= CARD_SEARCH_RADIUS) offsets.push([dx, dy]);
    }
  }
  return offsets.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));
})();

/** The diagrams whose cards are waiting to be placed again. */
const cardPlacementPending = new WeakSet<go.Diagram>();

/** Places the cards once, shortly, however many lines ask for it in the same moment. */
function scheduleCardPlacement(diagram: go.Diagram): void {
  if (cardPlacementPending.has(diagram)) return;
  cardPlacementPending.add(diagram);
  queueMicrotask(() => {
    cardPlacementPending.delete(diagram);
    if (diagram.div) placeLinkCards(diagram);
  });
}

/**
 * Puts every relationship card on its line. A card belongs where the info icon
 * is, in the middle of the line. Where that would cover a node or another card,
 * the card is moved along its line, a step at a time in either direction, and
 * tried on the line and right beside it, until a place is free. If the whole
 * line offers none, the card goes to the nearest free place around its icon. It
 * never covers a node as long as there is such a place within reach, and never
 * another card: two cards on top of each other could not be read at all.
 *
 * The lines take their turn in the order of their keys, so the outcome does not
 * depend on the order in which GoJS happened to draw them.
 */
export function placeLinkCards(diagram: go.Diagram): void {
  if (!allLinkCardsShown(diagram)) return;
  const nodes = new RectIndex();
  diagram.nodes.each((node) => nodes.add(node.actualBounds));
  const cards = new RectIndex();

  const lines: RelationshipLink[] = [];
  diagram.links.each((link) => {
    if (link instanceof RelationshipLink && link.pointsCount >= 2) lines.push(link);
  });
  lines.sort((a, b) => Number(a.key) - Number(b.key));

  for (const line of lines) {
    const card = line.findAdornment(CARD_ADORNMENT);
    if (!card) continue;
    card.ensureBounds();
    const { width, height } = card.actualBounds;
    const boxAt = (centre: go.Point) =>
      new go.Rect(centre.x - width / 2, centre.y - height / 2, width, height);
    const roomy = (box: go.Rect) => box.copy().inflate(CARD_CLEARANCE, CARD_CLEARANCE);

    // The middle of the line first, then ever further from it, to and fro. At each
    // point the card is tried on the line and then right beside it, on either side:
    // a line often runs close along a node, where only one side of it is free.
    const beside = [
      [0, 0],
      [0, -(height / 2 + CARD_CLEARANCE)],
      [0, height / 2 + CARD_CLEARANCE],
      [-(width / 2 + CARD_CLEARANCE), 0],
      [width / 2 + CARD_CLEARANCE, 0],
    ];
    const places: go.Point[] = [];
    for (let step = 0; step <= CARD_STEPS; step++) {
      for (const direction of step === 0 ? [1] : [1, -1]) {
        const point = line.pointAlongRoute(direction * step * CARD_STEP);
        if (!point) continue;
        for (const [dx, dy] of beside) places.push(new go.Point(point.x + dx, point.y + dy));
      }
    }
    // Should the whole line be hemmed in: the free place nearest to its info icon,
    // looked for in widening circles around it.
    const middle = line.midPoint;
    const free = (point: go.Point) => !cards.overlaps(roomy(boxAt(point)));
    const clear = (point: go.Point) => free(point) && !nodes.overlaps(roomy(boxAt(point)));
    const nearestClear = (): go.Point | undefined => {
      for (const [dx, dy] of NEARBY_OFFSETS) {
        const point = new go.Point(middle.x + dx, middle.y + dy);
        if (clear(point)) return point;
      }
      return undefined;
    };
    const centre = places.find(clear) ?? nearestClear() ?? places.find(free) ?? places[0] ?? middle;

    card.location = centre;
    cards.add(boxAt(centre));
  }
}

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
    withoutUndo(diagram, () => {
      this.fromShortLength = -fromGap;
      this.toShortLength = -toGap;
      if (arrow) arrow.segmentOffset = new go.Point(toGap, 0);
    });
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
      if (this.diagram && allLinkCardsShown(this.diagram)) {
        // The card says everything the icon would open, so the icon makes way for it.
        this.removeAdornment(INFO_ADORNMENT);
      } else {
        const icon = this.adornment(INFO_ADORNMENT, INFO_ICON_TEMPLATE);
        icon.location = this.midPoint;
        icon.opacity = this.opacity;
      }
      this.updateCard();
    }
    if (this.linkData?.ownership !== undefined) {
      const label = this.adornment(OWNERSHIP_ADORNMENT, OWNERSHIP_LABEL_TEMPLATE);
      const text = label.findObject(OWNERSHIP_TEXT);
      if (text instanceof go.TextBlock) text.text = formatOwnership(this.linkData.ownership);
      label.ensureBounds();
      label.opacity = this.opacity;
      // Several lines may end at the same node, even along the same last stretch,
      // so the percentages at a node are placed together.
      if (this.toNode) placeOwnershipLabels(this.toNode);
      else label.location = this.ownershipLabelPoint(label.actualBounds, 0);
    }
  }

  /**
   * Shows, fills in and places the small card with this relationship's data, or
   * takes it away, depending on whether all cards of the diagram are shown.
   */
  private updateCard(): void {
    const data = this.linkData;
    if (!data || !this.diagram || !allLinkCardsShown(this.diagram)) {
      this.removeAdornment(CARD_ADORNMENT);
      return;
    }
    const card = this.adornment(CARD_ADORNMENT, LINK_CARD_TEMPLATE);
    const write = (name: string, text: string) => {
      const block = card.findObject(name);
      if (block instanceof go.TextBlock) block.text = text;
    };
    const title = (node: go.Node | null) => (node?.data as NodeData | null)?.title ?? 'Unknown';
    write(CARD_TYPE, data.category === 'hierarchy' ? 'Hierarchy' : 'Relation');
    write(CARD_FROM, `From: ${title(this.fromNode)}`);
    write(CARD_TO, `To: ${title(this.toNode)}`);
    write(
      CARD_OWNERSHIP,
      data.ownership === undefined
        ? 'Ownership: no data'
        : `Ownership: ${formatOwnership(data.ownership)}`,
    );
    card.opacity = this.opacity;
    // A click on a line selects it; its card is marked with it.
    const frame = card.findObject(CARD_FRAME);
    if (frame instanceof go.Shape) {
      frame.stroke = this.isSelected ? SELECTION_GOLD : CARD_BORDER;
      frame.fill = this.isSelected ? CARD_FILL_SELECTED : CARD_FILL;
    }
    // Where it goes depends on the other cards, so all of them are placed together.
    scheduleCardPlacement(this.diagram);
  }

  /**
   * The point that lies `distance` further along this line than its middle,
   * measured along the route; a negative distance goes back towards the start.
   * Null when the line is not that long.
   */
  pointAlongRoute(distance: number): go.Point | null {
    const points: go.Point[] = [];
    for (let i = 0; i < this.pointsCount; i++) points.push(this.getPoint(i));
    const lengths = points
      .slice(1)
      .map((point, i) => Math.sqrt(point.distanceSquaredPoint(points[i])));
    const total = lengths.reduce((sum, length) => sum + length, 0);
    let remaining = total / 2 + distance;
    if (remaining < 0 || remaining > total) return null;
    for (let i = 0; i < lengths.length; i++) {
      if (remaining <= lengths[i] || i === lengths.length - 1) {
        const share = lengths[i] === 0 ? 0 : Math.min(1, remaining / lengths[i]);
        return new go.Point(
          points[i].x + (points[i + 1].x - points[i].x) * share,
          points[i].y + (points[i + 1].y - points[i].y) * share,
        );
      }
      remaining -= lengths[i];
    }
    return null;
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
   *
   * `place` picks among the places a label can have, for when the first is taken
   * by the percentage of another line: 0 is beside the line next to the node, 1
   * the same on the other side of the line, 2 and 3 one label further back from
   * the node, and so on.
   */
  ownershipLabelPoint(label: go.Rect, place: number): go.Point {
    const end = this.getPoint(this.pointsCount - 1);
    const before = this.getPoint(this.pointsCount - 2);
    const length = Math.hypot(end.x - before.x, end.y - before.y) || 1;
    const ux = (end.x - before.x) / length;
    const uy = (end.y - before.y) / length;
    // Half of the label's size along the line and across it.
    const along = (Math.abs(ux) * label.width + Math.abs(uy) * label.height) / 2;
    const across = (Math.abs(uy) * label.width + Math.abs(ux) * label.height) / 2;
    const stepsBack = Math.floor(place / 2);
    const back = along + OWNERSHIP_GAP_TO_NODE + stepsBack * (2 * along + OWNERSHIP_GAP_TO_LABEL);
    const side = place % 2 === 0 ? 1 : -1;
    const aside = side * (across + OWNERSHIP_GAP_TO_LINE);
    return new go.Point(end.x - ux * back - uy * aside, end.y - uy * back + ux * aside);
  }
}

/** How many places are tried for a percentage before it has to share one. */
const OWNERSHIP_PLACES = 12;

/**
 * Places the percentages of all lines that end at this node, so that none of
 * them covers another. The lines take their turn in the order of their keys, and
 * each gets the first place that is still free; that way the outcome does not
 * depend on which line GoJS happened to draw first.
 */
function placeOwnershipLabels(node: go.Node): void {
  const lines: RelationshipLink[] = [];
  node.findLinksInto().each((link) => {
    if (link instanceof RelationshipLink && link.pointsCount >= 2) lines.push(link);
  });
  lines.sort((a, b) => Number(a.key) - Number(b.key));

  const taken: go.Rect[] = [];
  for (const line of lines) {
    const label = line.findAdornment(OWNERSHIP_ADORNMENT);
    if (!label) continue;
    label.ensureBounds();
    const size = label.actualBounds;
    let centre = line.ownershipLabelPoint(size, 0);
    let box = new go.Rect();
    for (let place = 0; place < OWNERSHIP_PLACES; place++) {
      centre = line.ownershipLabelPoint(size, place);
      box = new go.Rect(
        centre.x - size.width / 2,
        centre.y - size.height / 2,
        size.width,
        size.height,
      );
      if (!taken.some((other) => other.intersectsRect(box))) break;
    }
    label.location = centre;
    taken.push(box);
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

/** How much thicker a line is drawn while the mouse is on it. */
const HOVER_EXTRA_WIDTH = 1.5;
/** The thickness each line had before the mouse came, to give it back afterwards. */
const widthBeforeHover = new WeakMap<go.Link, number>();

/**
 * Draws a line in gold and thicker while the mouse is on it, and as it was
 * before once the mouse has left. Display only, never an undo step.
 */
function showHovered(link: go.Link, hovered: boolean): void {
  const line = link.findObject(LINE);
  const arrow = link.findObject(ARROWHEAD);
  if (!(line instanceof go.Shape) || !link.diagram) return;
  if (hovered === widthBeforeHover.has(link)) return;
  withoutUndo(link.diagram, () => {
    if (hovered) {
      widthBeforeHover.set(link, line.strokeWidth);
      line.strokeWidth += HOVER_EXTRA_WIDTH;
    } else {
      line.strokeWidth = widthBeforeHover.get(link) ?? line.strokeWidth;
      widthBeforeHover.delete(link);
    }
    line.stroke = hovered ? HOVER_COLOR : LINE_COLOR;
    if (arrow instanceof go.Shape) arrow.fill = hovered ? HOVER_COLOR : LINE_COLOR;
  });
}

/** A link whose line type follows `modelData.linkType`. */
function createLink(...parts: go.GraphObject[]): go.Link {
  // Drawn behind the nodes. Links can be selected and removed, but not reconnected.
  return (
    new RelationshipLink({
      layerName: go.LayerNames.Background,
      // With the mouse on it, a line stands out, so that it can be followed among the others.
      mouseEnter: (_event, link) => showHovered(link as go.Link, true),
      mouseLeave: (_event, link) => showHovered(link as go.Link, false),
    })
      .bindModel('routing', 'linkType', (type: LinkType, link: go.Link) =>
        routingFor(type, link.diagram?.model.nodeDataArray.length ?? 0),
      )
      // Lines cross without hops: a little arc at every crossing reads as clutter, not as help.
      .bindModel('curve', 'linkType', (type: LinkType) => linkStyle(type).curve)
      .bindModel('corner', 'linkType', (type: LinkType) => linkStyle(type).corner)
      .add(
        // A wide invisible stroke along the same path, so thin lines are easy to click.
        new go.Shape({ isPanelMain: true, stroke: 'transparent', strokeWidth: 8 }),
        ...parts,
      )
  );
}

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
        // The main holdings are the backbone of the diagram, so they are drawn the thickest.
        new go.Shape({ name: LINE, isPanelMain: true, stroke: LINE_COLOR, strokeWidth: 2 }),
        new go.Shape({
          name: ARROWHEAD,
          toArrow: go.Arrowheads.Standard,
          fill: LINE_COLOR,
          stroke: null,
          scale: 0.9,
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
  // The cards that "expand all" shows go above everything else in the diagram:
  // above the nodes, and above the layer in which GoJS marks what is selected.
  // A selected line is drawn there as a thick coloured line along its whole
  // route; it has to pass behind the cards, also behind its own, not across them.
  diagram.addLayerAfter(
    new go.Layer({ name: CARD_LAYER, isTemporary: true }),
    diagram.findLayer('Adornment')!,
  );
  // A link dragged from the rim of one node to another node becomes a 'manual' link.
  diagram.toolManager.linkingTool.archetypeLinkData = { category: 'manual' satisfies LinkKind };
  handleClicks(diagram, clicks);
  linkFromEdge(diagram);
  diagram.addDiagramListener('SelectionMoved', (e) => rerouteLinksAcross(e.subject));
  // Lines are drawn up to the outline of a node, so when a node changes shape
  // its lines have to be measured again.
  // An undo or a redo puts values back without announcing each of them. So after
  // one, the cards are brought in line with the model again: it may have switched
  // them on or off, or changed a title that they show.
  diagram.addModelChangedListener((e) => {
    if (e.propertyName !== 'FinishedUndo' && e.propertyName !== 'FinishedRedo') return;
    if (allLinkCardsShown(diagram) || cardsDrawnIn.has(diagram)) refreshLinkCards(diagram);
  });
  // And a card names the two funds of its line, so it follows a new title too.
  diagram.addModelChangedListener((e) => {
    if (e.change !== go.ChangeType.Property || !e.object) return;
    // The cards of all relationships are switched on and off in the model.
    if (e.propertyName === 'cardsExpanded') return refreshLinkCards(diagram);
    if (e.propertyName !== 'shape' && e.propertyName !== 'title') return;
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
    for (const category of LINK_ADORNMENTS) {
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

/**
 * Everything that is highlighted with a node: the nodes and the lines.
 *
 * 1. Its tree: the chain of funds above it up to the top, and every fund below it,
 *    with the hierarchy lines between them.
 * 2. Every relationship line of the node itself, whatever its kind (hierarchy,
 *    other relationship, drawn by hand), with the fund at its other end.
 * 3. Every line that joins two funds that are highlighted by 1 and 2. A line
 *    between two highlighted nodes that stayed dim would look as if it were missing.
 */
function highlightOf(node: go.Node): go.Set<go.Part> {
  const parts = node.findTreeParts().addAll(node.findTreeParentChain());
  node.findLinksConnected().each((link) => {
    parts.add(link);
    const other = link.getOtherNode(node);
    if (other) parts.add(other);
  });
  node.diagram?.links.each((link) => {
    if (link.fromNode && link.toNode && parts.has(link.fromNode) && parts.has(link.toNode)) {
      parts.add(link);
    }
  });
  return parts;
}

/** The nodes that carry the gold outline of a highlighted tree. */
export function highlightedNodes(diagram: go.Diagram): go.Node[] {
  const nodes: go.Node[] = [];
  diagram.nodes.each((node) => {
    if (node.findAdornment(FOCUS_ADORNMENT)) nodes.push(node);
  });
  return nodes;
}

/**
 * Shows `node` and everything that belongs to it (see highlightOf) at full
 * strength, each node with a gold outline, and dims the rest of the diagram;
 * with null, nothing is dimmed or outlined.
 * This is display only and never becomes part of the undo history.
 */
export function highlightTree(diagram: go.Diagram, node: go.Node | null): void {
  const tree = node && highlightOf(node);
  diagram.commit((d) => {
    const show = (part: go.Part) => {
      part.opacity = !tree || tree.has(part) ? 1 : DIMMED_OPACITY;
      // A link's icon and percentage are parts of their own and have to be dimmed with it.
      for (const category of LINK_ADORNMENTS) {
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

/**
 * Makes the nodes of a freshly loaded diagram appear one after another, each
 * relationship as soon as both of its ends are there, and calls `done` when
 * everything is shown. Until then the diagram does not react to the mouse or
 * the keyboard. A big diagram shows several nodes per frame, so that the whole
 * reveal never takes longer than REVEAL_MAX_MS, and a very big one many more, so
 * that it takes no longer than REVEAL_LARGE_MS.
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

  const show = (part: go.Part, visible: boolean) => {
    part.opacity = visible ? 1 : 0;
    for (const category of LINK_ADORNMENTS) {
      const adornment = part.findAdornment(category);
      if (adornment) adornment.opacity = part.opacity;
    }
  };

  // Display only, here and below: none of this is recorded for undo. That goes
  // for switching the diagram off and on as well. GoJS records that like any
  // other change, and would put it into the next thing the user does; undoing
  // that would then switch the diagram off again.
  withoutUndo(diagram, () => {
    diagram.isEnabled = false;
    nodes.forEach((node) => show(node, false));
    diagram.links.each((link) => show(link, false));
  });

  const duration =
    nodes.length > REVEAL_LARGE_FROM
      ? REVEAL_LARGE_MS
      : Math.min(REVEAL_MAX_MS, nodes.length * REVEAL_STEP_MS);
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
    withoutUndo(diagram, () => {
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
    withoutUndo(diagram, () => (diagram.isEnabled = true));
    done();
  };
  frame = requestAnimationFrame(() => step());
  // No frames are drawn while the page is in the background. The diagram must not
  // stay disabled because of that, so a timer shows whatever is still missing.
  timer = window.setTimeout(() => step(true), duration + REVEAL_GRACE_MS);
  return stop;
}
