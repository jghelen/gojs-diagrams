import * as go from 'gojs/release/go';
import { DEFAULT_LINK_TYPE, LINK_TYPES, avoidsNodes, linkStyle } from './link-types';

describe('link types', () => {
  it('offers two orthogonal types, straight and curved', () => {
    expect(LINK_TYPES.map((style) => style.type)).toEqual([
      'avoid',
      'orthogonal',
      'straight',
      'curved',
    ]);
  });

  it('routes both orthogonal types around the nodes', () => {
    expect(avoidsNodes('avoid')).toBe(true);
    expect(avoidsNodes('orthogonal')).toBe(true);
    expect(linkStyle('avoid').routing).toBe(go.Routing.AvoidsNodes);
    expect(linkStyle('orthogonal').routing).toBe(go.Routing.AvoidsNodes);
  });

  it('tells the two orthogonal types apart by their corners', () => {
    expect(linkStyle('avoid').corner).toBeGreaterThan(0);
    expect(linkStyle('orthogonal').corner).toBe(0);
  });

  it('says in the label when a type crosses nodes', () => {
    for (const style of LINK_TYPES) {
      expect(style.label.includes('crosses nodes')).toBe(!avoidsNodes(style.type));
    }
  });

  it('draws curved lines as beziers', () => {
    expect(linkStyle('curved').curve).toBe(go.Curve.Bezier);
    expect(linkStyle('straight').curve).toBe(go.Curve.None);
  });

  it('has an icon for every type', () => {
    for (const style of LINK_TYPES) expect(style.icon).toMatch(/^M/);
    expect(new Set(LINK_TYPES.map((style) => style.icon)).size).toBe(LINK_TYPES.length);
  });

  it('starts with lines that avoid nodes', () => {
    expect(avoidsNodes(DEFAULT_LINK_TYPE)).toBe(true);
  });
});
