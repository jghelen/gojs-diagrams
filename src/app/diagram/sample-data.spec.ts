import { createFundStructure } from './sample-data';
import { DEFAULT_COLOR, DEFAULT_SHAPE } from './constants';

describe('createFundStructure', () => {
  const { nodes, links } = createFundStructure();
  const keys = new Set(nodes.map((node) => node.key));
  const hierarchy = links.filter((link) => link.category === 'hierarchy');
  const relations = links.filter((link) => link.category === 'relation');

  it('has a fund of funds at the top that invests through two feeders and two funds of funds', () => {
    expect(nodes).toHaveLength(24);
    expect(nodes[0]).toMatchObject({
      title: 'Meridian Global FoF',
      legalEntityType: 'Fund of funds',
    });
    const holdingsOf = (key: number) =>
      hierarchy.filter((link) => link.from === key).map((link) => link.to);
    const typeOf = (key: number) => nodes.find((node) => node.key === key)!.legalEntityType;
    expect(holdingsOf(1).map(typeOf).sort()).toEqual([
      'Feeder fund',
      'Feeder fund',
      'Fund of funds',
      'Fund of funds',
    ]);
  });

  it('is one tree: every fund but the top one has exactly one main investor', () => {
    expect(hierarchy).toHaveLength(nodes.length - 1);
    const parents = new Map(hierarchy.map((link) => [link.to, link.from]));
    expect(parents.size).toBe(nodes.length - 1);
    for (const node of nodes) {
      let key = node.key;
      for (let steps = 0; parents.has(key); steps++) {
        expect(steps).toBeLessThan(nodes.length);
        key = parents.get(key)!;
      }
      expect(key).toBe(1);
    }
  });

  it('keeps every name short enough to be shown in full on a node', () => {
    for (const node of nodes) expect(node.title.length).toBeLessThanOrEqual(20);
  });

  it('gives every fund a name and a legal entity type', () => {
    for (const node of nodes) {
      expect(node.title.trim()).not.toBe('');
      expect(node.legalEntityType.trim()).not.toBe('');
    }
    expect(new Set(nodes.map((node) => node.title)).size).toBe(nodes.length);
  });

  it('starts every fund as a light gray rectangle', () => {
    for (const node of nodes) {
      expect(node.shape).toBe(DEFAULT_SHAPE);
      expect(node.color).toBe(DEFAULT_COLOR);
    }
  });

  it('has a comment on two funds', () => {
    expect(nodes.filter((node) => node.comment !== '')).toHaveLength(2);
  });

  it('adds three co-investments between existing funds', () => {
    expect(relations).toHaveLength(3);
    for (const link of links) {
      expect(keys.has(link.from)).toBe(true);
      expect(keys.has(link.to)).toBe(true);
    }
  });

  it('knows the ownership of some relationships and not of others', () => {
    const known = links.filter((link) => link.ownership !== undefined);
    expect(known.length).toBeGreaterThan(0);
    expect(known.length).toBeLessThan(links.length);
    for (const link of known) {
      expect(link.ownership).toBeGreaterThan(0);
      expect(link.ownership).toBeLessThanOrEqual(100);
    }
  });

  it('builds fresh data on every call', () => {
    const again = createFundStructure();
    expect(again.nodes).toEqual(nodes);
    expect(again.nodes).not.toBe(nodes);
    expect(again.nodes[0]).not.toBe(nodes[0]);
  });
});
