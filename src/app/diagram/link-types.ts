import * as go from 'gojs/release/go';

export type LinkType = 'avoid' | 'orthogonal' | 'straight' | 'curved';

interface LinkStyle {
  type: LinkType;
  label: string;
  routing: go.Routing;
  curve: go.Curve;
  /** Radius of the bends of an orthogonal route. */
  corner: number;
  /** SVG path of a small line drawing of the type, in a 24 x 24 box. */
  icon: string;
}

/**
 * The two orthogonal types are routed around the nodes. A straight or curved
 * line has no bends to go around anything with, so those two cross whatever
 * lies between their ends, and their labels say so.
 */
export const LINK_TYPES: readonly LinkStyle[] = [
  {
    type: 'avoid',
    label: 'Orthogonal, rounded',
    routing: go.Routing.AvoidsNodes,
    curve: go.Curve.None,
    corner: 6,
    icon: 'M3 6h8a5 5 0 0 1 5 5v2a5 5 0 0 0 5 5',
  },
  {
    type: 'orthogonal',
    label: 'Orthogonal, square',
    routing: go.Routing.AvoidsNodes,
    curve: go.Curve.None,
    corner: 0,
    icon: 'M3 6h10v12h8',
  },
  {
    type: 'straight',
    label: 'Straight (crosses nodes)',
    routing: go.Routing.Normal,
    curve: go.Curve.None,
    corner: 0,
    icon: 'M3 19L21 5',
  },
  {
    type: 'curved',
    label: 'Curved (crosses nodes)',
    routing: go.Routing.Normal,
    curve: go.Curve.Bezier,
    corner: 0,
    icon: 'M3 19C12 19 12 5 21 5',
  },
];

export const DEFAULT_LINK_TYPE: LinkType = 'avoid';

export function linkStyle(type: LinkType): LinkStyle {
  return LINK_TYPES.find((style) => style.type === type) ?? LINK_TYPES[0];
}

export function avoidsNodes(type: LinkType): boolean {
  return linkStyle(type).routing === go.Routing.AvoidsNodes;
}

/**
 * Lines are routed around the nodes on diagrams with fewer nodes than this. Doing
 * that for every line takes about a second at 200 nodes, seven at 500 and minutes
 * beyond that, during which the page does not respond.
 */
export const AVOID_NODES_BELOW = 500;

/** True when a diagram of that many nodes is too big to route its lines around them. */
export function tooBigToAvoidNodes(nodeCount: number): boolean {
  return nodeCount >= AVOID_NODES_BELOW;
}

/**
 * How lines of that type are routed in a diagram of that many nodes. On a big
 * diagram the orthogonal types keep their right-angled look but are no longer
 * routed around the nodes.
 */
export function routingFor(type: LinkType, nodeCount: number): go.Routing {
  const routing = linkStyle(type).routing;
  return routing === go.Routing.AvoidsNodes && tooBigToAvoidNodes(nodeCount)
    ? go.Routing.Orthogonal
    : routing;
}
