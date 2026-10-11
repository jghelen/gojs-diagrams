import { Injector } from '@angular/core';
import * as go from 'gojs/release/go';
import { IconClicks, NodeModel, createDiagram, createModel } from '../app/diagram/diagram-factory';
import { HistoryService } from '../app/diagram/history.service';
import { LayoutType, createLayout } from '../app/diagram/layouts';
import { LinkType } from '../app/diagram/link-types';
import { LinkData, NodeData, createLinks, createNodes } from '../app/diagram/node-data';

export interface TestDiagram {
  diagram: go.Diagram;
  model: NodeModel;
  /** The undo history of the diagram, through the same service the page uses. */
  history: HistoryService;
  /** What the diagram reported about clicks on icons, in order. */
  clicks: { icon: keyof IconClicks; key: number }[];
  /** Lets GoJS do everything it would do before the next frame: layout, routing, adornments. */
  settle: () => void;
  /** Clicks at a document point the way the mouse would, through the click-selecting tool. */
  clickAt: (point: go.Point) => void;
}

/**
 * A history service of its own, made by Angular's injector as in the app, where
 * the page provides one per diagram. A test may have several diagrams, so every
 * call makes a new injector and with it a new service.
 */
export function createHistory(): HistoryService {
  return Injector.create({ providers: [HistoryService] }).get(HistoryService);
}

/** A diagram on a detached-from-layout div, loaded and laid out, with icon clicks recorded. */
export function createTestDiagram(
  options: {
    nodes?: NodeData[];
    links?: LinkData[];
    count?: number;
    layout?: LayoutType;
    linkType?: LinkType;
  } = {},
): TestDiagram {
  const count = options.count ?? 30;
  const nodes = options.nodes ?? createNodes(count);
  const links = options.links ?? createLinks(count);
  const layoutType = options.layout ?? 'top-bottom';
  const linkType = options.linkType ?? 'avoid';

  const clicks: TestDiagram['clicks'] = [];
  const record =
    (icon: keyof IconClicks) =>
    (data: { key: number }): void => {
      clicks.push({ icon, key: data.key });
    };
  const div = document.createElement('div');
  document.body.appendChild(div);
  const diagram = createDiagram(div, {
    onLinkInfo: record('onLinkInfo'),
    onNodeColor: record('onNodeColor'),
    onNodeComment: record('onNodeComment'),
    onNodeBatch: record('onNodeBatch'),
    onNodeDelete: record('onNodeDelete'),
  });
  // jsdom gives the div no size; this is how GoJS is told the size of the view without one.
  diagram.viewSize = new go.Size(1000, 700);
  diagram.layout = createLayout(layoutType, nodes.length);
  const model = createModel(
    { nodes, links },
    { layoutType, linkType, name: 'Test diagram', description: '' },
  );
  const history = createHistory();
  history.connect(diagram);
  history.load(model);

  const settle = (): void => {
    for (let i = 0; i < 3; i++) diagram.maybeUpdate();
  };
  const clickAt = (point: go.Point): void => {
    diagram.lastInput.documentPoint = point.copy();
    diagram.lastInput.control = false;
    diagram.lastInput.shift = false;
    diagram.toolManager.clickSelectingTool.standardMouseSelect();
    settle();
  };
  settle();
  history.markInitialState();
  return { diagram, model, history, clicks, settle, clickAt };
}

/** The nodes of a diagram as an array. */
export function nodesOf(diagram: go.Diagram): go.Node[] {
  const nodes: go.Node[] = [];
  diagram.nodes.each((node) => nodes.push(node));
  return nodes;
}

/** The links of a diagram as an array. */
export function linksOf(diagram: go.Diagram): go.Link[] {
  const links: go.Link[] = [];
  diagram.links.each((link) => links.push(link));
  return links;
}

/** How many pairs of nodes overlap. */
export function countNodeOverlaps(diagram: go.Diagram): number {
  const bounds = nodesOf(diagram).map((node) => node.actualBounds);
  let overlaps = 0;
  for (let i = 0; i < bounds.length; i++) {
    for (let j = i + 1; j < bounds.length; j++) {
      const a = bounds[i];
      const b = bounds[j];
      if (
        a.x < b.right - 0.5 &&
        b.x < a.right - 0.5 &&
        a.y < b.bottom - 0.5 &&
        b.y < a.bottom - 0.5
      ) {
        overlaps++;
      }
    }
  }
  return overlaps;
}

/** How many lines run across a node that is not one of their own ends. */
export function countLinksOverNodes(diagram: go.Diagram): number {
  const nodes = nodesOf(diagram);
  let crossing = 0;
  diagram.links.each((link) => {
    const points = link.points;
    for (let i = 0; i < points.count - 1; i++) {
      const p = points.elt(i);
      const q = points.elt(i + 1);
      const hit = nodes.some((node) => {
        if (node === link.fromNode || node === link.toNode) return false;
        const b = node.actualBounds;
        return go.Rect.intersectsLineSegment(
          b.x + 1,
          b.y + 1,
          b.width - 2,
          b.height - 2,
          p.x,
          p.y,
          q.x,
          q.y,
        );
      });
      if (hit) {
        crossing++;
        return;
      }
    }
  });
  return crossing;
}
