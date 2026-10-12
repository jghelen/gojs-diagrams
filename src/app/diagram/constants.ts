/**
 * The fixed values that describe what the app offers and where its limits are:
 * the choices a user gets, the defaults a diagram starts with, the sizes from
 * which the app behaves differently, colours, timings and texts.
 *
 * A value belongs here when it is a decision about the product, something one
 * might be asked to change ("add a colour", "allow 500 rows", "make the outline
 * blue"). Numbers that only fine-tune one drawing routine, such as a gap of
 * three pixels between a line and its label, stay next to that routine.
 */
import * as go from 'gojs/release/go';
import type { LayoutType } from './layouts';
import type { LinkType } from './link-types';

// ----- What a fund can look like -----

/**
 * The shapes a node can have.
 *
 * Only figures that come with GoJS itself, and only ones whose outline reaches
 * the middle of the top and of the bottom of their bounds: that is where every
 * line attaches, and at, say, a triangle standing on its tip it would end in
 * mid air.
 */
export const SHAPES: readonly go.FigureName[] = [
  go.Figures.Rectangle,
  go.Figures.RoundedRectangle,
  go.Figures.Ellipse,
  go.Figures.Diamond,
  go.Figures.Capsule,
  go.Figures.RoundedTopRectangle,
];

/** Every node starts out as a rectangle… */
export const DEFAULT_SHAPE: go.FigureName = go.Figures.Rectangle;
/** …in a very light gray. */
export const DEFAULT_COLOR = '#f3f4f6';

/** The colours offered as swatches. Any other colour can be picked with the colour chooser. */
export const COLORS: readonly string[] = [
  DEFAULT_COLOR,
  '#fde68a',
  '#a7f3d0',
  '#bfdbfe',
  '#fecaca',
  '#ddd6fe',
  '#fed7aa',
  '#99f6e4',
  '#1e3a8a',
];

/**
 * The legal entity types: the kinds of fund there are. A node can show its type
 * under its name, and the styles dialog groups the nodes by it.
 */
export const LEGAL_ENTITY_TYPES: readonly string[] = [
  'Private equity',
  'Venture capital',
  'Hedge fund',
  'Private credit',
  'Real estate',
  'Infrastructure',
  'Fund of funds',
  'Feeder fund',
];

/**
 * The fields of a legal entity by which the styles dialog can group the nodes,
 * to give all nodes with the same value the same look. For now there is one.
 */
export const STYLE_FIELDS = [{ id: 'legalEntityType', label: 'Legal entity type' }] as const;
export type StyleFieldId = (typeof STYLE_FIELDS)[number]['id'];

// ----- Colours of the diagram -----

/** The border of every node: dark gray. */
export const NODE_BORDER = '#555555';
/** Every relationship line is black and equally thick; only a hand-drawn one differs, by being dotted. */
export const LINE_COLOR = '#000000';
export const LINE_WIDTH = 1.5;
/** The outline of a selected node, of the nodes of a highlighted tree and of a search result. */
export const SELECTION_GOLD = '#d4a017';
/** The ownership percentages at the ends of lines: dark green. */
export const OWNERSHIP_COLOR = '#166534';
/** How much is left to see (1 = everything) of what lies outside a highlighted tree. */
export const DIMMED_OPACITY = 0.15;

// ----- What a diagram starts with -----

/** How many funds the generated diagrams of the Data dropdown have. */
export const NODE_COUNTS: readonly number[] = [30, 100, 200, 500, 1000, 2000];
/** The diagram the app opens with: its id in the Data dropdown. */
export const DEFAULT_DATASET = '30';
/** The id of the dataset with nothing in it, for building a diagram from scratch. */
export const BLANK_DATASET = 'blank';
/**
 * What the Data dropdown shows while the diagram is one of the database, opened
 * from the list of diagrams. Not a dataset of the app: its data comes from the backend.
 */
export const STORED_DATASET = 'stored';
/** The layout a diagram is first shown in. */
export const DEFAULT_LAYOUT: LayoutType = 'top-bottom';
/** The line type a diagram is first shown with: orthogonal, rounded, routed around nodes. */
export const DEFAULT_LINK_TYPE: LinkType = 'avoid';

/**
 * How many co-investments the generated diagrams have per fund, on top of the
 * one main investor each fund has. Half a co-investment per fund is about what
 * real fund structures show, and it keeps the lines few enough to be followed.
 * For a denser diagram to load-test with, raise this number.
 */
export const CO_INVESTMENTS_PER_FUND = 0.5;

/**
 * Free space left between two nodes by every layout: wide enough for several
 * lines to run side by side with their percentages.
 */
export const NODE_GAP = 60;

/**
 * How far apart lines are drawn that share a stretch of their way, or that
 * attach to the same side of a node. As near to each other as they can be while
 * each can still be told from the next, and clicked: a line takes the clicks up
 * to half this distance on either side of it.
 */
export const LINE_SPACING = 6;

/**
 * How far the bulk edit ("N × randomize all") moves a node at most, to the left or right and up or
 * down, from where it stood before the first such move. Little enough that two
 * neighbours never touch and the gap between two rows stays wide enough for lines.
 */
export const NODE_NUDGE = 15;

/** The color of a line while the mouse is on it, so that one line can be followed among many. */
export const HOVER_COLOR = '#d4a017';

// ----- Sizes from which the app behaves differently -----

/**
 * On diagrams with fewer nodes than this, GoJS itself routes the lines around
 * the nodes. That takes about a second at 200 nodes and several seconds at 500,
 * during which the page does not respond, and minutes beyond 1000. From this
 * number on the app's own router does it instead, in a fraction of a second
 * (lane-router.ts).
 */
export const AVOID_NODES_BELOW = 1000;

/**
 * The layouts that stay quick however big the diagram is. The others (circle,
 * layered, force-directed) take many seconds each from SLOW_LAYOUTS_FROM nodes
 * on. So there "Randomize all" picks its next layout among the quick ones only,
 * and a diagram that big is not opened in a slow layout left over from a smaller
 * one. The user can still choose a slow layout for a big diagram by hand. Test
 */
export const QUICK_LAYOUTS: readonly LayoutType[] = ['top-bottom', 'bottom-top', 'grid'];
export const SLOW_LAYOUTS_FROM = 500;

/** Up to this many nodes, a tree is drawn in the classic organisation-chart style. */
export const CLASSIC_TREE_LIMIT = 60;

/**
 * Upper limit for runs × nodes of one bulk edit ("N × randomize all"). Beyond
 * it the page would be blocked for too long.
 */
export const BULK_EDIT_BUDGET = 40_000;

// ----- The loading animation -----

/** How long one node takes to appear, in milliseconds. */
export const REVEAL_STEP_MS = 40;
/** The longest the whole animation may take, however many nodes there are. */
export const REVEAL_MAX_MS = 1500;
/**
 * A diagram with more nodes than this is shown in REVEAL_LARGE_MS instead: its
 * nodes are too small to be told apart anyway, and opening it must not take
 * noticeably longer than drawing it does.
 */
export const REVEAL_LARGE_FROM = 200;
export const REVEAL_LARGE_MS = 500;
/**
 * How long after the animation should have ended everything is shown anyway.
 * That is for a page in the background, where the browser draws no frames.
 */
export const REVEAL_GRACE_MS = 500;

// ----- Benchmark statistics -----

/** How many operations the statistics table keeps; older ones drop off the end. */
export const MAX_LOG_ENTRIES = 30;
/**
 * How many changes of an operation are listed one by one in the Changes dialog.
 * An action on a big diagram makes thousands; those are only counted.
 */
export const MAX_CHANGE_ROWS = 200;

// ----- Export and print -----

/**
 * A picture of the diagram is drawn at twice the size of the diagram, so that
 * small text stays sharp, also on high-resolution screens.
 */
export const IMAGE_SCALE = 2;
/** Very large diagrams are drawn smaller, so that no side of the picture exceeds this many pixels. */
export const IMAGE_MAX_SIDE = 10_000;

// ----- Texts and keys -----

/** Shown above the diagram after an action failed and its changes were taken back. */
export const FAILURE_NOTICE =
  'That action could not be completed and was undone. You can keep working on the diagram.';
/** Shown above the diagram when data could not be opened completely. */
export const LOAD_FAILURE_NOTICE =
  'That diagram could not be opened. An empty one was opened instead; choose other data to go on.';
/** Shown above an empty diagram when the diagram of the address is not in the database. */
export const NO_SUCH_DIAGRAM_NOTICE =
  'There is no diagram at this address. It may have been deleted; choose another from the list of all diagrams.';
/** Shown above an empty diagram when the backend did not hand the diagram out. */
export const DIAGRAM_NOT_READ_NOTICE =
  'The diagram could not be read from the database. Check that the backend is running, then reset the diagram to try again.';
/** What the user is asked before leaving a diagram with changes for another page of the app. */
export const LEAVE_QUESTION = 'Leave this diagram? The changes you made will be lost.';
/** The name under which the browser remembers whether the developer tools are shown. */
export const DEVELOPER_TOOLS_KEY = 'gojs-diagrams.developer-tools-shown';
/** The name under which the browser remembers whether the benchmark statistics are open. */
export const LOG_OPEN_KEY = 'gojs-diagrams.benchmark-statistics-open';
