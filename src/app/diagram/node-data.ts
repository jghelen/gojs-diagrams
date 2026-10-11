import * as go from 'gojs/release/go';

export interface NodeData {
  key: number;
  title: string;
  subtitle: string;
  shape: go.FigureName;
  color: string;
  /** Free text attached to the node; empty when there is no comment. */
  comment: string;
  /** "x y", parsed by go.Point.parse. Written by the diagram layout, not by the generator. */
  loc?: string;
}

/**
 * 'hierarchy' links form the parent-child tree, 'relation' links are extra cross
 * references, and 'manual' links are the ones the user draws from node to node.
 */
export type LinkKind = 'hierarchy' | 'relation' | 'manual';

export interface LinkData {
  key: number;
  from: number;
  to: number;
  category: LinkKind;
  /**
   * How much of the `to` fund the `from` fund owns, in percent with two decimals.
   * Left out when that is not known.
   */
  ownership?: number;
}

/** An ownership percentage as it is shown on a line, e.g. "37.50%". */
export function formatOwnership(ownership: number): string {
  return `${ownership.toFixed(2)}%`;
}

/** The custom fields that the bench mutates and the UndoManager has to restore. */
export type EditableField = 'title' | 'subtitle' | 'shape' | 'color';
export const EDITABLE_FIELDS: readonly EditableField[] = ['title', 'subtitle', 'shape', 'color'];

// Only figures that ship with core GoJS (no Figures.js extension needed), and only
// ones that reach the left and right edge of their bounds at mid-height: GoJS's
// node-avoiding link routing cuts through the empty corners of a triangle.
export const SHAPES: readonly go.FigureName[] = [
  go.Figures.Rectangle,
  go.Figures.RoundedRectangle,
  go.Figures.Ellipse,
  go.Figures.Diamond,
  go.Figures.Capsule,
  go.Figures.RoundedTopRectangle,
];

/** Every node starts out as a very light gray rectangle. */
export const DEFAULT_SHAPE: go.FigureName = go.Figures.Rectangle;
export const DEFAULT_COLOR = '#f3f4f6';

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

// Generated funds are called "<house> <strategy> <number>", e.g. "Atlas Credit 17".
const HOUSES = [
  'Alpine',
  'Harbor',
  'Summit',
  'Cedar',
  'Meridian',
  'Atlas',
  'Northstar',
  'Evergreen',
];
const STRATEGIES = [
  'Growth',
  'Income',
  'Equity',
  'Credit',
  'Venture',
  'Infra',
  'Property',
  'Macro',
];

/** The subtitle of every node is the type of fund it is. */
export const FUND_TYPES: readonly string[] = [
  'Private equity',
  'Venture capital',
  'Hedge fund',
  'Private credit',
  'Real estate',
  'Infrastructure',
  'Fund of funds',
  'Feeder fund',
];

/** Sizes of the randomly generated diagrams. */
export const NODE_COUNTS: readonly number[] = [30, 100, 200, 500, 1000, 2000];

const MAX_CHILDREN = 4;
/** Cross-reference links per node, on top of the one hierarchy link each non-root node has. */
const RELATIONS_PER_NODE = 1.5;
/** Share of the generated links for which an ownership percentage is known. */
const OWNERSHIP_KNOWN = 0.7;

type Random = () => number;

/** Small seeded PRNG so the initial diagram is the same on every load. */
function mulberry32(seed: number): Random {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(items: readonly T[], random: Random): T {
  return items[Math.floor(random() * items.length)];
}

function pickOther<T>(items: readonly T[], current: T, random: Random): T {
  let next = pick(items, random);
  while (next === current) next = pick(items, random);
  return next;
}

export function createNodes(count: number): NodeData[] {
  const random = mulberry32(count);
  return Array.from({ length: count }, (_, i) => ({
    key: i + 1,
    title: `${pick(HOUSES, random)} ${pick(STRATEGIES, random)} ${i + 1}`,
    subtitle: pick(FUND_TYPES, random),
    shape: DEFAULT_SHAPE,
    color: DEFAULT_COLOR,
    comment: '',
  }));
}

/** A single-rooted tree over keys 1..count plus random cross links between unrelated nodes. */
export function createLinks(count: number): LinkData[] {
  const random = mulberry32(count + 1);
  // A generator of its own, so that the percentages do not change which links exist.
  const stakes = mulberry32(count + 2);
  const links: LinkData[] = [];
  const connected = new Set<string>();
  const add = (from: number, to: number, category: LinkKind) => {
    connected.add(`${from}>${to}`);
    const link: LinkData = { key: links.length + 1, from, to, category };
    const stake = stakes();
    // Between 0.01% and 100.00%, for about seven links in ten.
    if (stakes() < OWNERSHIP_KNOWN) link.ownership = Math.round(stake * 9999 + 1) / 100;
    links.push(link);
  };

  // Breadth-first: every parent in turn takes the next 1..MAX_CHILDREN keys as children.
  let child = 2;
  for (let parent = 1; child <= count; parent++) {
    for (let n = 1 + Math.floor(random() * MAX_CHILDREN); n > 0 && child <= count; n--) {
      add(parent, child++, 'hierarchy');
    }
  }

  const possiblePairs = count * (count - 1) - (count - 1);
  for (
    let remaining = Math.min(Math.floor(count * RELATIONS_PER_NODE), possiblePairs);
    remaining > 0;
  ) {
    const from = 1 + Math.floor(random() * count);
    const to = 1 + Math.floor(random() * count);
    if (from === to || connected.has(`${from}>${to}`)) continue;
    add(from, to, 'relation');
    remaining--;
  }
  return links;
}

/** New values for all four custom fields, each guaranteed to differ from the current one. */
export function randomPatch(
  data: NodeData,
  random: Random = Math.random,
): Pick<NodeData, EditableField> {
  return {
    title: `${pickOther(HOUSES, data.title.split(' ')[0], random)} ${pick(STRATEGIES, random)} ${data.key}`,
    subtitle: pickOther(FUND_TYPES, data.subtitle, random),
    shape: pickOther(SHAPES, data.shape, random),
    color: pickOther(COLORS, data.color, random),
  };
}
