import * as go from 'gojs/release/go';
import { COLORS, LEGAL_ENTITY_TYPES, SHAPES } from './constants';

export interface NodeData {
  key: number;
  title: string;
  /** The kind of fund this is; one of LEGAL_ENTITY_TYPES unless the user typed another. */
  legalEntityType: string;
  shape: go.FigureName;
  color: string;
  /** Free text attached to the node; empty when there is no comment. */
  comment: string;
  /** Where the node stands: "x y" of its top left corner. Written by the diagram. */
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
export type EditableField = 'title' | 'legalEntityType' | 'shape' | 'color';
export const EDITABLE_FIELDS: readonly EditableField[] = [
  'title',
  'legalEntityType',
  'shape',
  'color',
];

// ----- What funds are called -----
//
// The names are invented. They are used for the random edits of the developer
// tools, and by the generated diagrams that the tests work on (src/testing).

/** Invented names of fund managers. A fund's title starts with one of them. */
export const HOUSES = [
  'Alpine',
  'Harbor',
  'Summit',
  'Cedar',
  'Meridian',
  'Atlas',
  'Northstar',
  'Evergreen',
  'Bluewater',
  'Ironbridge',
  'Kestrel',
  'Larkspur',
  'Oakmont',
  'Pinecrest',
  'Redwood',
  'Silverlake',
];

export const FUND_OF_FUNDS = 'Fund of funds';
export const FEEDER_FUND = 'Feeder fund';

/** What funds of each type are called, after the name of their house. */
export const FUND_NAMES: Record<string, readonly string[]> = {
  'Private equity': ['Buyout', 'Growth Equity', 'Mid-Market'],
  'Venture capital': ['Venture', 'Seed', 'Early Stage'],
  'Hedge fund': ['Global Macro', 'Long-Short Equity', 'Multi-Strategy'],
  'Private credit': ['Direct Lending', 'Senior Debt', 'Mezzanine'],
  'Real estate': ['Core Property', 'Value-Add Property', 'Logistics Property'],
  Infrastructure: ['Energy Infra', 'Transport Infra', 'Digital Infra'],
  [FUND_OF_FUNDS]: ['Global Allocation', 'Private Markets', 'Multi-Manager'],
  [FEEDER_FUND]: ['Feeder', 'Offshore Feeder', 'Onshore Feeder'],
};

export type Random = () => number;

export function pick<T>(items: readonly T[], random: Random): T {
  return items[Math.floor(random() * items.length)];
}

export function pickOther<T>(items: readonly T[], current: T, random: Random): T {
  let next = pick(items, random);
  while (next === current) next = pick(items, random);
  return next;
}

/** The title of a fund: its house, what it is called, and its number. */
export function fundTitle(house: string, type: string, key: number, random: Random): string {
  return `${house} ${pick(FUND_NAMES[type] ?? ['Fund'], random)} ${key}`;
}

/** New values for all four custom fields, each guaranteed to differ from the current one. */
export function randomPatch(
  data: NodeData,
  random: Random = Math.random,
): Pick<NodeData, EditableField> {
  const legalEntityType = pickOther(LEGAL_ENTITY_TYPES, data.legalEntityType, random);
  return {
    title: fundTitle(
      pickOther(HOUSES, data.title.split(' ')[0], random),
      legalEntityType,
      data.key,
      random,
    ),
    legalEntityType,
    shape: pickOther(SHAPES, data.shape, random),
    color: pickOther(COLORS, data.color, random),
  };
}
