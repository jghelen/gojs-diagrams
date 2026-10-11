import * as go from 'gojs/release/go';
import {
  CO_INVESTMENTS_PER_FUND,
  COLORS,
  DEFAULT_COLOR,
  DEFAULT_SHAPE,
  LEGAL_ENTITY_TYPES,
  SHAPES,
} from './constants';

export interface NodeData {
  key: number;
  title: string;
  /** The kind of fund this is; one of LEGAL_ENTITY_TYPES unless the user typed another. */
  legalEntityType: string;
  shape: go.FigureName;
  color: string;
  /** Free text attached to the node; empty when there is no comment. */
  comment: string;
  /** "x y", parsed by go.Point.parse. Written by the diagram layout, not by the generator. */
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

// ----- Generated fund structures -----
//
// The generated diagrams are made to read like real holdings of investment
// funds. The names of the houses are invented; the way the funds are built on
// one another is the usual one:
//
//   a fund of funds  ->  feeder funds and further funds of funds
//   a feeder fund    ->  exactly one fund, its master
//   a strategy fund  ->  sub-funds and co-investment vehicles of the same strategy
//
// A line runs from the fund that invests to the fund it invests in, and its
// percentage says how much of that fund the investor owns.

/** Invented names of fund managers. A fund's title starts with one of them. */
const HOUSES = [
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

const FUND_OF_FUNDS = 'Fund of funds';
const FEEDER_FUND = 'Feeder fund';
/** The legal entity types that invest according to a strategy; the other two invest in funds. */
const STRATEGY_TYPES = LEGAL_ENTITY_TYPES.filter(
  (type) => type !== FUND_OF_FUNDS && type !== FEEDER_FUND,
);

/** What funds of each type are called, after the name of their house. */
const FUND_NAMES: Record<string, readonly string[]> = {
  'Private equity': ['Buyout', 'Growth Equity', 'Mid-Market'],
  'Venture capital': ['Venture', 'Seed', 'Early Stage'],
  'Hedge fund': ['Global Macro', 'Long-Short Equity', 'Multi-Strategy'],
  'Private credit': ['Direct Lending', 'Senior Debt', 'Mezzanine'],
  'Real estate': ['Core Property', 'Value-Add Property', 'Logistics Property'],
  Infrastructure: ['Energy Infra', 'Transport Infra', 'Digital Infra'],
  [FUND_OF_FUNDS]: ['Global Allocation', 'Private Markets', 'Multi-Manager'],
  [FEEDER_FUND]: ['Feeder', 'Offshore Feeder', 'Onshore Feeder'],
};

const MAX_CHILDREN = 4;
/** For how many main holdings, and for how many co-investments, the percentage is known. */
const MAIN_STAKE_KNOWN = 0.9;
const CO_STAKE_KNOWN = 0.75;

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

/** The title of a fund: its house, what it is called, and its number. */
function fundTitle(house: string, type: string, key: number, random: Random): string {
  return `${house} ${pick(FUND_NAMES[type] ?? ['Fund'], random)} ${key}`;
}

/**
 * Who is the main investor of whom, for funds 1 to `count`: `parent[key]` is the
 * fund that holds the largest stake in fund `key`. Fund 1 is at the top and has
 * none. Breadth-first, every fund in turn takes the next 1 to MAX_CHILDREN funds
 * as the ones it invests in, so an investor always has a smaller key than what
 * it invests in.
 */
function mainInvestors(count: number): number[] {
  const random = mulberry32(count + 1);
  const parent = new Array<number>(count + 1).fill(0);
  let child = 2;
  for (let investor = 1; child <= count; investor++) {
    for (let n = 1 + Math.floor(random() * MAX_CHILDREN); n > 0 && child <= count; n--) {
      parent[child++] = investor;
    }
  }
  return parent;
}

/** The type and the house of every fund, by key; index 0 is not used. */
function fundProfiles(count: number): { type: string; house: string }[] {
  const random = mulberry32(count);
  const parent = mainInvestors(count);
  const holdings = new Array<number>(count + 1).fill(0);
  for (let key = 2; key <= count; key++) holdings[parent[key]]++;

  const profiles: { type: string; house: string }[] = [{ type: '', house: '' }];
  // The strategies a fund of funds has already invested in, so that it spreads over several.
  const strategiesOf = new Map<number, Set<string>>();
  const newStrategyFor = (investor: number): string => {
    const taken = strategiesOf.get(investor) ?? new Set<string>();
    const open = STRATEGY_TYPES.filter((type) => !taken.has(type));
    const strategy = pick(open.length > 0 ? open : STRATEGY_TYPES, random);
    strategiesOf.set(investor, taken.add(strategy));
    return strategy;
  };

  // How many levels of funds of funds there are below the top fund. A big
  // structure has several: allocators that invest through other allocators.
  const allocatorLevels = Math.max(1, Math.floor(Math.log(count) / Math.log(3)) - 2);
  const depth = new Array<number>(count + 1).fill(0);

  for (let key = 1; key <= count; key++) {
    const investor = profiles[parent[key]];
    depth[key] = key === 1 ? 0 : depth[parent[key]] + 1;
    // The vehicles the top fund invests through carry its name; further down the houses differ.
    const house = depth[key] === 1 ? investor.house : pick(HOUSES, random);
    if (key === 1) {
      // The fund at the top spreads its money over other funds.
      profiles.push({ type: FUND_OF_FUNDS, house });
    } else if (
      investor.type === FUND_OF_FUNDS &&
      holdings[key] >= 2 &&
      depth[key] <= allocatorLevels
    ) {
      // A fund of funds invests in further funds of funds…
      profiles.push({ type: FUND_OF_FUNDS, house });
    } else if (
      investor.type === FUND_OF_FUNDS &&
      holdings[key] === 1 &&
      (depth[key] === 1 || random() < 0.35)
    ) {
      // …through feeders, each of which holds a single fund…
      profiles.push({ type: FEEDER_FUND, house });
    } else if (investor.type === FUND_OF_FUNDS) {
      // …and directly in strategy funds, each of another strategy.
      profiles.push({ type: newStrategyFor(parent[key]), house });
    } else if (investor.type === FEEDER_FUND) {
      // A feeder puts its money into one master fund of the same house.
      profiles.push({ type: pick(STRATEGY_TYPES, random), house: investor.house });
    } else {
      // A strategy fund invests in sub-funds and co-investment vehicles of its own kind.
      profiles.push({ type: investor.type, house: investor.house });
    }
  }
  return profiles;
}

export function createNodes(count: number): NodeData[] {
  const random = mulberry32(count + 4);
  const profiles = fundProfiles(count);
  return Array.from({ length: count }, (_, i) => ({
    key: i + 1,
    title: fundTitle(profiles[i + 1].house, profiles[i + 1].type, i + 1, random),
    legalEntityType: profiles[i + 1].type,
    shape: DEFAULT_SHAPE,
    color: DEFAULT_COLOR,
    comment: '',
  }));
}

/** A percentage with two decimals, at least 0.01. */
function percent(value: number): number {
  return Math.max(0.01, Math.round(value * 100) / 100);
}

/**
 * Who invests in whom, and how much of each fund every investor owns.
 *
 * - Every fund but the top one has one main investor (a 'hierarchy' line), which
 *   holds the largest stake in it.
 * - On top of that there are co-investments ('relation' lines): smaller stakes
 *   held by other funds.
 * - Money only flows downwards: a fund never invests in a fund that, directly or
 *   through others, invests in it. So there is no circular ownership.
 * - A feeder fund invests in its one master fund and nowhere else.
 * - All stakes in a fund together are at most 100%; what is missing belongs to
 *   investors that are not in the diagram.
 * - For some lines the percentage is not known and is left out.
 */
export function createLinks(count: number): LinkData[] {
  const random = mulberry32(count + 3);
  const parent = mainInvestors(count);
  const profiles = fundProfiles(count);
  const links: LinkData[] = [];
  const connected = new Set<string>();
  const add = (from: number, to: number, category: LinkKind) => {
    connected.add(`${from}>${to}`);
    links.push({ key: links.length + 1, from, to, category });
  };

  for (let key = 2; key <= count; key++) add(parent[key], key, 'hierarchy');

  // Co-investments. The investor always has the smaller key, as in the tree, which
  // rules out circles; and funds near the top, the allocators, invest most often.
  const wanted = Math.floor(count * CO_INVESTMENTS_PER_FUND);
  for (let made = 0, tries = 0; made < wanted && tries < wanted * 200; tries++) {
    const to = 3 + Math.floor(random() * Math.max(count - 2, 0));
    const from = 1 + Math.floor(random() * random() * (to - 1));
    if (to > count || from >= to || connected.has(`${from}>${to}`)) continue;
    if (profiles[from].type === FEEDER_FUND) continue;
    add(from, to, 'relation');
    made++;
  }

  assignStakes(links, profiles, count);
  return links;
}

/** Gives every line its percentage, fund by fund, so that the stakes in a fund add up to at most 100%. */
function assignStakes(links: LinkData[], profiles: { type: string }[], count: number): void {
  // A generator of its own, so that the percentages do not change which lines exist.
  const random = mulberry32(count + 2);
  const investorsOf = new Map<number, LinkData[]>();
  for (const link of links) {
    const list = investorsOf.get(link.to) ?? [];
    list.push(link);
    investorsOf.set(link.to, list);
  }
  for (let fund = 2; fund <= count; fund++) {
    const investors = investorsOf.get(fund) ?? [];
    const main = investors.find((link) => link.category === 'hierarchy');
    const others = investors.filter((link) => link.category !== 'hierarchy');
    if (!main) continue;

    // A feeder exists to hold a large part of its master; other main investors hold less.
    const viaFeeder = profiles[main.from].type === FEEDER_FUND;
    const mainStake = percent(viaFeeder ? 45 + random() * 50 : 25 + random() * 50);
    // The co-investors share part of the rest; what is left belongs to outside investors.
    const shared = (100 - mainStake) * (0.3 + random() * 0.6);
    const weights = others.map(() => 0.2 + random());
    const weightSum = weights.reduce((sum, weight) => sum + weight, 0);

    if (random() < MAIN_STAKE_KNOWN) main.ownership = mainStake;
    others.forEach((link, i) => {
      // Never as much as the main investor holds.
      const stake = percent(Math.min((shared * weights[i]) / weightSum, mainStake - 0.01));
      if (random() < CO_STAKE_KNOWN) link.ownership = stake;
    });
  }
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
