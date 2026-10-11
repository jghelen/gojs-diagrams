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

export const COLORS: readonly string[] = [
  '#fde68a',
  '#a7f3d0',
  '#bfdbfe',
  '#fecaca',
  '#ddd6fe',
  '#fed7aa',
  '#99f6e4',
  '#1e3a8a',
];

const TITLES = ['Order', 'Invoice', 'Customer', 'Shipment', 'Payment', 'Ticket', 'Account', 'Task'];
const STATES = ['draft', 'pending', 'in review', 'approved', 'rejected', 'archived'];

/** Sizes of the randomly generated diagrams. */
export const NODE_COUNTS: readonly number[] = [30, 100, 200, 500, 1000, 2000];

const MAX_CHILDREN = 4;
/** Cross-reference links per node, on top of the one hierarchy link each non-root node has. */
const RELATIONS_PER_NODE = 1.5;

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
    title: `${pick(TITLES, random)} ${i + 1}`,
    subtitle: pick(STATES, random),
    shape: pick(SHAPES, random),
    color: pick(COLORS, random),
    comment: '',
  }));
}

/** A single-rooted tree over keys 1..count plus random cross links between unrelated nodes. */
export function createLinks(count: number): LinkData[] {
  const random = mulberry32(count + 1);
  const links: LinkData[] = [];
  const connected = new Set<string>();
  const add = (from: number, to: number, category: LinkKind) => {
    connected.add(`${from}>${to}`);
    links.push({ key: links.length + 1, from, to, category });
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
    title: `${pickOther(TITLES, data.title.split(' ')[0], random)} ${data.key}`,
    subtitle: pickOther(STATES, data.subtitle, random),
    shape: pickOther(SHAPES, data.shape, random),
    color: pickOther(COLORS, data.color, random),
  };
}
