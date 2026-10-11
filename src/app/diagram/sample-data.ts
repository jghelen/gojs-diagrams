import { LinkData, NodeData } from './node-data';
import { DEFAULT_COLOR, DEFAULT_SHAPE } from './constants';

/** One fund in the sample structure, with the funds below it. */
interface Fund {
  name: string;
  /** The type of fund, shown as the node's subtitle. */
  type: string;
  /** How much of this fund the fund above it owns, in percent; left out when not known. */
  stake?: number;
  comment?: string;
  funds?: Fund[];
}

// An umbrella fund with three families of sub-funds, one per asset class. Each
// family has two funds, and investors come into those through feeder and
// co-investment funds. It is meant for showing the tree layouts, not for load testing.
const UMBRELLA_FUND: Fund = {
  name: 'Meridian SICAV',
  type: 'Umbrella fund',
  comment: 'Annual audit is due on 31 March.',
  funds: [
    {
      name: 'Meridian Equity',
      type: 'Private equity',
      stake: 100,
      funds: [
        {
          name: 'Buyout Fund IV',
          type: 'Buyout',
          stake: 62.5,
          funds: [
            { name: 'Buyout IV US', type: 'Feeder fund', stake: 48.75 },
            { name: 'Buyout IV EU', type: 'Feeder fund', stake: 36.2 },
            { name: 'Buyout IV Co-Invest', type: 'Co-investment' },
          ],
        },
        {
          name: 'Growth Fund II',
          type: 'Growth equity',
          stake: 37.5,
          comment: 'Capital call notice has been sent to investors.',
          funds: [
            { name: 'Growth II US', type: 'Feeder fund', stake: 55 },
            { name: 'Growth II EU', type: 'Feeder fund' },
            { name: 'Growth II Co-Invest', type: 'Co-investment', stake: 12.33 },
          ],
        },
      ],
    },
    {
      name: 'Meridian Credit',
      type: 'Private credit',
      stake: 100,
      funds: [
        {
          name: 'Direct Lending',
          type: 'Direct lending',
          stake: 80.25,
          funds: [
            { name: 'Lending Onshore', type: 'Feeder fund', stake: 51.01 },
            { name: 'Lending Offshore', type: 'Feeder fund' },
          ],
        },
        {
          name: 'Structured Credit',
          type: 'Structured credit',
          funds: [
            { name: 'CLO Equity', type: 'Feeder fund', stake: 24.9 },
            { name: 'Trade Finance', type: 'Feeder fund' },
          ],
        },
      ],
    },
    {
      name: 'Meridian Real Assets',
      type: 'Real assets',
      stake: 75,
      funds: [
        {
          name: 'Infrastructure',
          type: 'Infrastructure',
          stake: 66.67,
          funds: [
            { name: 'Infra Onshore', type: 'Feeder fund', stake: 40 },
            { name: 'Infra Offshore', type: 'Feeder fund', stake: 60 },
          ],
        },
        {
          name: 'Real Estate',
          type: 'Real estate',
          stake: 33.33,
          funds: [
            { name: 'Real Estate Onshore', type: 'Feeder fund' },
            { name: 'Real Estate Offshore', type: 'Feeder fund' },
          ],
        },
      ],
    },
  ],
};

/**
 * Holdings outside the tree, by fund name, with the percentage owned where it is known.
 */
const CROSS_LINKS: [from: string, to: string, stake?: number][] = [
  ['Growth Fund II', 'Infrastructure', 8.5],
  ['Direct Lending', 'Buyout Fund IV'],
  ['Real Estate', 'Structured Credit', 15.75],
];

/** The sample fund structure as node and link data: the fund tree plus a few cross links. */
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
      subtitle: fund.type,
      shape: DEFAULT_SHAPE,
      color: DEFAULT_COLOR,
      comment: fund.comment ?? '',
    });
    if (parent !== undefined) addLink(parent, key, 'hierarchy', fund.stake);
    for (const below of fund.funds ?? []) add(below, key);
  };

  add(UMBRELLA_FUND);
  for (const [from, to, stake] of CROSS_LINKS) {
    addLink(keyOf.get(from)!, keyOf.get(to)!, 'relation', stake);
  }
  return { nodes, links };
}
