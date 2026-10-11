import { DATASETS, findDataset } from './datasets';
import { BLANK_DATASET, DEFAULT_DATASET, FUND_TYPES } from './constants';
import { LinkData } from './node-data';

describe('datasets', () => {
  it('offers the sample fund structure and the generated sizes', () => {
    expect(DATASETS.map((dataset) => dataset.id)).toEqual([
      'fund-structure',
      '30',
      '100',
      '200',
      '500',
      '1000',
      '2000',
      'blank',
    ]);
  });

  it('opens with the 30-node diagram', () => {
    expect(DEFAULT_DATASET).toBe('30');
    expect(findDataset(DEFAULT_DATASET).create().nodes).toHaveLength(30);
  });

  it('labels every dataset with data as funds', () => {
    for (const dataset of DATASETS) {
      if (dataset.id === BLANK_DATASET) continue;
      expect(dataset.label.toLowerCase()).toContain('fund');
    }
  });

  it('has an empty dataset for starting from scratch', () => {
    expect(findDataset(BLANK_DATASET).create()).toEqual({ nodes: [], links: [] });
  });

  it('creates as many nodes as the dataset says', () => {
    expect(findDataset('100').create().nodes).toHaveLength(100);
    expect(findDataset('fund-structure').create().nodes).toHaveLength(24);
  });

  it('falls back to the first dataset for an unknown id', () => {
    expect(findDataset('nope')).toBe(DATASETS[0]);
  });

  it('creates new data on every call, so that a reset starts clean', () => {
    const dataset = findDataset('30');
    expect(dataset.create().nodes).not.toBe(dataset.create().nodes);
  });
});

/**
 * Every dataset has to read like real holdings of investment funds. A line runs
 * from the fund that invests to the fund it invests in, and its percentage is
 * the part of that fund the investor owns.
 */
describe.each(DATASETS.filter((dataset) => dataset.id !== BLANK_DATASET).map((d) => [d.label, d]))(
  'realistic fund holdings: %s',
  (_label, dataset) => {
    const { nodes, links } = dataset.create();
    const fund = new Map(nodes.map((node) => [node.key, node]));
    const main = links.filter((link) => link.category === 'hierarchy');
    const investorsIn = new Map<number, LinkData[]>();
    const holdingsOf = new Map<number, LinkData[]>();
    for (const link of links) {
      investorsIn.set(link.to, [...(investorsIn.get(link.to) ?? []), link]);
      holdingsOf.set(link.from, [...(holdingsOf.get(link.from) ?? []), link]);
    }
    const STRATEGIES = FUND_TYPES.filter(
      (type) => !['Fund of funds', 'Feeder fund'].includes(type),
    );

    it('has one fund of funds at the top, in which no other fund invests', () => {
      const tops = nodes.filter((node) => !investorsIn.has(node.key));
      expect(tops).toHaveLength(1);
      expect(tops[0].subtitle).toBe('Fund of funds');
    });

    it('gives every other fund exactly one main investor', () => {
      const mainOf = new Map<number, number>();
      for (const link of main) {
        expect(mainOf.has(link.to)).toBe(false);
        mainOf.set(link.to, link.from);
      }
      expect(mainOf.size).toBe(nodes.length - 1);
    });

    it('uses only the known kinds of fund', () => {
      for (const node of nodes) expect(FUND_TYPES).toContain(node.subtitle);
    });

    it('has no fund that invests in itself, and no two lines between the same two funds', () => {
      const pairs = new Set<string>();
      for (const link of links) {
        expect(link.from).not.toBe(link.to);
        const pair = [link.from, link.to].sort((a, b) => a - b).join('-');
        expect(pairs.has(pair)).toBe(false);
        pairs.add(pair);
      }
    });

    it('has no circular ownership: money only flows one way', () => {
      // Funds are taken away one by one once nothing invests in them any more.
      const open = new Map(
        nodes.map((node) => [node.key, (investorsIn.get(node.key) ?? []).length]),
      );
      const ready = nodes.filter((node) => open.get(node.key) === 0).map((node) => node.key);
      let taken = 0;
      while (ready.length > 0) {
        const key = ready.pop()!;
        taken++;
        for (const link of holdingsOf.get(key) ?? []) {
          open.set(link.to, open.get(link.to)! - 1);
          if (open.get(link.to) === 0) ready.push(link.to);
        }
      }
      expect(taken).toBe(nodes.length);
    });

    it('gives stakes as percentages with two decimals, between 0.01 and 100', () => {
      for (const link of links) {
        if (link.ownership === undefined) continue;
        expect(link.ownership).toBeGreaterThanOrEqual(0.01);
        expect(link.ownership).toBeLessThanOrEqual(100);
        expect(Math.abs(link.ownership * 100 - Math.round(link.ownership * 100))).toBeLessThan(
          1e-9,
        );
      }
    });

    it('never has more than 100% of a fund owned', () => {
      for (const [, investors] of investorsIn) {
        const owned = investors.reduce((sum, link) => sum + (link.ownership ?? 0), 0);
        expect(owned).toBeLessThanOrEqual(100.000001);
      }
    });

    it('lets the main investor hold the largest known stake in a fund', () => {
      for (const [, investors] of investorsIn) {
        const lead = investors.find((link) => link.category === 'hierarchy')!;
        if (lead.ownership === undefined) continue;
        for (const other of investors) {
          if (other !== lead && other.ownership !== undefined) {
            expect(other.ownership).toBeLessThan(lead.ownership);
          }
        }
      }
    });

    it('lets a feeder fund invest in exactly one fund', () => {
      const feeders = nodes.filter((node) => node.subtitle === 'Feeder fund');
      for (const feeder of feeders) expect(holdingsOf.get(feeder.key) ?? []).toHaveLength(1);
    });

    it('keeps the sub-funds of a strategy fund within its strategy', () => {
      for (const link of main) {
        const investor = fund.get(link.from)!;
        if (STRATEGIES.includes(investor.subtitle)) {
          expect(fund.get(link.to)!.subtitle).toBe(investor.subtitle);
        }
      }
    });

    it('lets a fund of funds or a feeder hold strategy funds, not the other way round', () => {
      for (const link of main) {
        const investee = fund.get(link.to)!;
        if (['Fund of funds', 'Feeder fund'].includes(investee.subtitle)) {
          expect(fund.get(link.from)!.subtitle).toBe('Fund of funds');
        }
      }
    });

    it('knows most percentages, and leaves some out where there is no data', () => {
      const known = links.filter((link) => link.ownership !== undefined);
      expect(known.length).toBeGreaterThan(links.length * 0.5);
      expect(known.length).toBeLessThan(links.length);
    });
  },
);
