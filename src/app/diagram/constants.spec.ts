import {
  AVOID_NODES_BELOW,
  COLORS,
  DEFAULT_COLOR,
  DEFAULT_LAYOUT,
  DEFAULT_LINK_TYPE,
  DEFAULT_SHAPE,
  LEGAL_ENTITY_TYPES,
  MAX_CHANGE_ROWS,
  REVEAL_LARGE_MS,
  REVEAL_MAX_MS,
  SHAPES,
  SLOW_LAYOUTS_FROM,
} from './constants';
import { LAYOUTS } from './layouts';
import { LINK_TYPES } from './link-types';
import { SHAPE_TILES } from './shape-tiles';

describe('constants', () => {
  it('offer every choice once', () => {
    for (const list of [SHAPES, COLORS, LEGAL_ENTITY_TYPES]) {
      expect(new Set<unknown>(list).size).toBe(list.length);
    }
  });

  it('have defaults that are among the choices', () => {
    expect(SHAPES).toContain(DEFAULT_SHAPE);
    expect(COLORS[0]).toBe(DEFAULT_COLOR);
    expect(LAYOUTS.map((layout) => layout.type)).toContain(DEFAULT_LAYOUT);
    expect(LINK_TYPES.map((style) => style.type)).toContain(DEFAULT_LINK_TYPE);
  });

  it('have a picture for every shape', () => {
    expect(SHAPE_TILES.map((tile) => tile.figure)).toEqual([...SHAPES]);
  });

  it('write colours as six-digit hex codes, which the colour chooser needs', () => {
    for (const color of COLORS) expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('keep their limits in a sensible order', () => {
    expect(SLOW_LAYOUTS_FROM).toBeLessThanOrEqual(AVOID_NODES_BELOW);
    expect(REVEAL_LARGE_MS).toBeLessThan(REVEAL_MAX_MS);
    expect(MAX_CHANGE_ROWS).toBeGreaterThan(0);
  });
});
