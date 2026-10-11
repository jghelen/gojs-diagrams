import { LinkData, NodeData } from './node-data';
import { DEFAULT_COLOR, DEFAULT_SHAPE } from './constants';

/** One fund in the sample structure, with the funds it invests in. */
interface Fund {
  name: string;
  /** The legal entity type of the fund. */
  type: string;
  /** How much of this fund the fund above it owns, in percent; left out when not known. */
  stake?: number;
  comment?: string;
  funds?: Fund[];
}

// A fund of funds and what it holds, four levels deep. It invests through two
// feeders, each of which holds one private equity fund, and through two further
// funds of funds, one for credit and one for real assets. A line runs from the
// fund that invests to the fund it invests in; the stake is the part of that
// fund the investor owns. The names are invented. It is meant for showing the
// tree layouts, not for load testing.
const TOP_FUND: Fund = {
  name: 'Meridian Global FoF',
  type: 'Fund of funds',
  comment: 'Annual audit is due on 31 March.',
  funds: [
    {
      name: 'Meridian PE Feeder',
      type: 'Feeder fund',
      stake: 64,
      funds: [
        {
          name: 'Buyout Fund IV',
          type: 'Private equity',
          stake: 48.75,
          funds: [
            { name: 'Buyout IV Co-Invest', type: 'Private equity', stake: 35.5 },
            { name: 'Buyout IV Parallel', type: 'Private equity' },
          ],
        },
      ],
    },
    {
      name: 'Growth Feeder',
      type: 'Feeder fund',
      stake: 55,
      funds: [
        {
          name: 'Growth Fund II',
          type: 'Private equity',
          stake: 37.5,
          comment: 'Capital call notice has been sent to investors.',
          funds: [
            { name: 'Growth II Co-Invest', type: 'Private equity', stake: 12.33 },
            { name: 'Growth II Annex', type: 'Private equity' },
          ],
        },
      ],
    },
    {
      name: 'Meridian Credit FoF',
      type: 'Fund of funds',
      stake: 100,
      funds: [
        {
          name: 'Direct Lending III',
          type: 'Private credit',
          stake: 22.4,
          funds: [{ name: 'Senior Loan Sleeve', type: 'Private credit', stake: 51 }],
        },
        {
          name: 'Structured Credit',
          type: 'Private credit',
          stake: 18,
          funds: [{ name: 'CLO Equity Tranche', type: 'Private credit', stake: 40 }],
        },
        { name: 'Mezzanine Fund II', type: 'Private credit' },
      ],
    },
    {
      name: 'Meridian Real Assets',
      type: 'Fund of funds',
      stake: 80.25,
      funds: [
        {
          name: 'Core Real Estate',
          type: 'Real estate',
          stake: 31,
          funds: [
            { name: 'Logistics Property', type: 'Real estate', stake: 45 },
            { name: 'Office Portfolio', type: 'Real estate', stake: 28.6 },
          ],
        },
        {
          name: 'Infrastructure I',
          type: 'Infrastructure',
          stake: 27.5,
          funds: [
            { name: 'Renewable Energy', type: 'Infrastructure', stake: 60 },
            { name: 'Toll Roads Vehicle', type: 'Infrastructure' },
          ],
        },
        {
          name: 'Venture Access',
          type: 'Venture capital',
          stake: 9.9,
          funds: [{ name: 'Seed Fund III', type: 'Venture capital', stake: 33.3 }],
        },
      ],
    },
  ],
};

/**
 * Co-investments on top of the tree, by fund name: a second, smaller investor in
 * a fund, with the percentage it owns where that is known.
 */
const CO_INVESTMENTS: [from: string, to: string, stake?: number][] = [
  ['Meridian Credit FoF', 'Buyout Fund IV', 8.5],
  ['Meridian Real Assets', 'Direct Lending III'],
  ['Meridian Global FoF', 'Core Real Estate', 15.75],
];

/** The sample fund structure as node and link data: the tree of holdings plus a few co-investments. */
export function createFundStructure(): { nodes: NodeData[]; links: LinkData[] } {
  const nodes: NodeData[] = [];
  const links: LinkData[] = [];
  const keyOf = new Map<string, number>();
  const addLink = (from: number, to: number, category: LinkData['category'], stake?: number) => {
    const link: LinkData = { key: links.length + 1, from, to, category };
    if (stake !== undefined) link.ownership = stake;
    links.push(link);
  };

  const add = (fund: Fund, parent?: number): void => {
    const key = nodes.length + 1;
    keyOf.set(fund.name, key);
    nodes.push({
      key,
      title: fund.name,
      legalEntityType: fund.type,
      shape: DEFAULT_SHAPE,
      color: DEFAULT_COLOR,
      comment: fund.comment ?? '',
    });
    if (parent !== undefined) addLink(parent, key, 'hierarchy', fund.stake);
    for (const below of fund.funds ?? []) add(below, key);
  };

  add(TOP_FUND);
  for (const [from, to, stake] of CO_INVESTMENTS) {
    addLink(keyOf.get(from)!, keyOf.get(to)!, 'relation', stake);
  }
  return { nodes, links };
}
