import { SHAPE_TILES } from './shape-tiles';
import { SHAPES } from './constants';

describe('shape tiles', () => {
  it('has one tile for every node shape', () => {
    expect(SHAPE_TILES.map((tile) => tile.figure).sort()).toEqual([...SHAPES].sort());
  });

  it('gives every tile a name of its own and a closed outline', () => {
    expect(new Set(SHAPE_TILES.map((tile) => tile.label)).size).toBe(SHAPE_TILES.length);
    for (const tile of SHAPE_TILES) expect(tile.path).toMatch(/^M.*Z$/);
  });
});
