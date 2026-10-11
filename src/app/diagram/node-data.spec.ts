import {
  COLORS,
  DEFAULT_COLOR,
  DEFAULT_SHAPE,
  EDITABLE_FIELDS,
  FUND_TYPES,
  LinkData,
  NODE_COUNTS,
  SHAPES,
  createLinks,
  createNodes,
  formatOwnership,
  randomPatch,
} from './node-data';

const hierarchy = (links: LinkData[]) => links.filter((link) => link.category === 'hierarchy');
const relations = (links: LinkData[]) => links.filter((link) => link.category === 'relation');

describe('createNodes', () => {
  it('creates the requested number of nodes with keys 1 to n', () => {
    const nodes = createNodes(30);
    expect(nodes.map((node) => node.key)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });

  it('starts every node as a light gray rectangle without a comment', () => {
    for (const node of createNodes(100)) {
      expect(node.shape).toBe(DEFAULT_SHAPE);
      expect(node.color).toBe(DEFAULT_COLOR);
      expect(node.comment).toBe('');
    }
  });

  it('names every node like a fund, ending in its key', () => {
    for (const node of createNodes(100)) {
      expect(node.title).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+ \d+$/);
      expect(node.title.endsWith(` ${node.key}`)).toBe(true);
    }
  });

  it('uses a fund type as the subtitle of every node', () => {
    for (const node of createNodes(100)) expect(FUND_TYPES).toContain(node.subtitle);
  });

  it('leaves the position to the layout', () => {
    for (const node of createNodes(30)) expect(node.loc).toBeUndefined();
  });

  it('gives the same nodes every time for the same size', () => {
    expect(createNodes(200)).toEqual(createNodes(200));
  });
});

describe.each([30, 200])('createLinks for %i nodes', (count) => {
  const links = createLinks(count);

  it('numbers the links from 1 without gaps', () => {
    expect(links.map((link) => link.key)).toEqual(links.map((_, i) => i + 1));
  });

  it('gives every node except the first exactly one parent, with a smaller key', () => {
    const parents = new Map<number, number>();
    for (const link of hierarchy(links)) {
      expect(parents.has(link.to)).toBe(false);
      expect(link.from).toBeLessThan(link.to);
      parents.set(link.to, link.from);
    }
    expect(parents.has(1)).toBe(false);
    expect(parents.size).toBe(count - 1);
  });

  it('gives no node more than four children', () => {
    const children = new Map<number, number>();
    for (const link of hierarchy(links))
      children.set(link.from, (children.get(link.from) ?? 0) + 1);
    expect(Math.max(...children.values())).toBeLessThanOrEqual(4);
  });

  it('adds one and a half cross links per node', () => {
    expect(relations(links)).toHaveLength(Math.floor(count * 1.5));
  });

  it('never links a node to itself or repeats a link', () => {
    const seen = new Set<string>();
    for (const link of links) {
      expect(link.from).not.toBe(link.to);
      const pair = `${link.from}>${link.to}`;
      expect(seen.has(pair)).toBe(false);
      seen.add(pair);
    }
  });

  it('only connects nodes that exist', () => {
    for (const link of links) {
      for (const key of [link.from, link.to]) {
        expect(key).toBeGreaterThanOrEqual(1);
        expect(key).toBeLessThanOrEqual(count);
      }
    }
  });

  it('knows the ownership of most links but not of all', () => {
    const known = links.filter((link) => link.ownership !== undefined);
    expect(known.length).toBeGreaterThan(links.length * 0.5);
    expect(known.length).toBeLessThan(links.length);
  });

  it('gives ownership as a percentage with two decimals', () => {
    for (const link of links) {
      if (link.ownership === undefined) continue;
      expect(link.ownership).toBeGreaterThanOrEqual(0.01);
      expect(link.ownership).toBeLessThanOrEqual(100);
      expect(Math.abs(link.ownership * 100 - Math.round(link.ownership * 100))).toBeLessThan(1e-9);
    }
  });

  it('gives the same links every time', () => {
    expect(createLinks(count)).toEqual(links);
  });
});

describe('randomPatch', () => {
  it('changes all four editable fields', () => {
    for (const node of createNodes(50)) {
      const patch = randomPatch(node);
      expect(Object.keys(patch).sort()).toEqual([...EDITABLE_FIELDS].sort());
      for (const field of EDITABLE_FIELDS) expect(patch[field]).not.toBe(node[field]);
    }
  });

  it('keeps the node recognisable and its values valid', () => {
    for (const node of createNodes(50)) {
      const patch = randomPatch(node);
      expect(patch.title.endsWith(` ${node.key}`)).toBe(true);
      expect(FUND_TYPES).toContain(patch.subtitle);
      expect(SHAPES).toContain(patch.shape);
      expect(COLORS).toContain(patch.color);
    }
  });
});

describe('formatOwnership', () => {
  it('always shows two decimals and a percent sign', () => {
    expect(formatOwnership(37.5)).toBe('37.50%');
    expect(formatOwnership(100)).toBe('100.00%');
    expect(formatOwnership(0.92)).toBe('0.92%');
    expect(formatOwnership(66.67)).toBe('66.67%');
  });
});

describe('palettes', () => {
  it('offers the default color and shape among the choices', () => {
    expect(COLORS).toContain(DEFAULT_COLOR);
    expect(SHAPES).toContain(DEFAULT_SHAPE);
  });

  it('offers no triangle, which node-avoiding lines cut through', () => {
    expect(SHAPES.some((shape) => shape.includes('Triangle'))).toBe(false);
  });

  it('offers diagram sizes from 30 to 2000 nodes', () => {
    expect(NODE_COUNTS).toEqual([30, 100, 200, 500, 1000, 2000]);
  });
});
