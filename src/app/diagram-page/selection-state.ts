import { Injectable, signal } from '@angular/core';
import * as go from 'gojs/release/go';
import { highlightTree, highlightedNodes } from '../diagram/diagram-factory';
import { EditableField, LinkData, NodeData } from '../diagram/node-data';

/** The selected nodes: per field, the value they all share, or null where they differ. */
export type Selection = { count: number } & { [F in EditableField]: NodeData[F] | null };

/**
 * The nodes the Shape tool works on, and the shape they all have (null where
 * they differ). `highlighted` says that these are the highlighted nodes, not
 * only the selected ones.
 */
export interface ShapeScope {
  count: number;
  shape: string | null;
  highlighted: boolean;
}

/**
 * What is selected in the diagram, and the highlight that goes with it.
 *
 * GoJS knows what is selected; this service turns that into what the page
 * shows (how many, which values they share) and into the lists the actions
 * work on. It also owns the highlight: with exactly one node selected,
 * everything that belongs to that node is shown at full strength and the rest
 * of the diagram is dimmed.
 */
@Injectable()
export class SelectionState {
  /** The selected nodes as the side panel shows them; null when no node is selected. */
  readonly selected = signal<Selection | null>(null);
  /** Number of relationships selected directly. */
  readonly selectedLinks = signal(0);
  /** Number of relationships attached to the selected nodes. */
  readonly linksOfSelectedNodes = signal(0);
  /** What the Shape tool would change; null when there is nothing for it to change. */
  readonly shapeScope = signal<ShapeScope | null>(null);

  private diagram!: go.Diagram;
  /** True while a node's surroundings are highlighted and the rest of the diagram dimmed. */
  private highlighted = false;

  connect(diagram: go.Diagram): void {
    this.diagram = diagram;
  }

  // ----- What is selected -----

  selectedNodes(): NodeData[] {
    const nodes: NodeData[] = [];
    this.diagram.selection.each((part) => {
      if (part instanceof go.Node && part.data) nodes.push(part.data as NodeData);
    });
    return nodes;
  }

  selectedLinkData(): LinkData[] {
    const links: LinkData[] = [];
    this.diagram.selection.each((part) => {
      if (part instanceof go.Link && part.data) links.push(part.data as LinkData);
    });
    return links;
  }

  /** Every relationship that starts or ends at one of the selected nodes. */
  linkDataOfSelectedNodes(): LinkData[] {
    const links = new Set<LinkData>();
    this.diagram.selection.each((part) => {
      if (!(part instanceof go.Node)) return;
      part.findLinksConnected().each((link) => {
        if (link.data) links.add(link.data as LinkData);
      });
    });
    return [...links];
  }

  /** The nodes the Shape tool changes: all highlighted ones, or else the selected ones. */
  shapeTargets(): NodeData[] {
    if (!this.highlighted) return this.selectedNodes();
    return highlightedNodes(this.diagram).map((node) => node.data as NodeData);
  }

  /** Works out anew everything the page shows about the selection. */
  sync(): void {
    this.selectedLinks.set(this.selectedLinkData().length);
    this.linksOfSelectedNodes.set(this.linkDataOfSelectedNodes().length);
    this.syncShapeScope();
    const nodes = this.selectedNodes();
    const shared = <F extends EditableField>(field: F): NodeData[F] | null =>
      nodes.every((data) => data[field] === nodes[0][field]) ? nodes[0][field] : null;
    this.selected.set(
      nodes.length === 0
        ? null
        : {
            count: nodes.length,
            title: shared('title'),
            legalEntityType: shared('legalEntityType'),
            shape: shared('shape'),
            color: shared('color'),
          },
    );
  }

  // ----- The highlight -----

  /**
   * With exactly one node selected, highlights what belongs to it; any other
   * selection ends the highlight.
   */
  highlightSelected(): void {
    const selection = this.diagram.selection;
    const only = selection.count === 1 ? selection.first() : null;
    if (only instanceof go.Node) {
      highlightTree(this.diagram, only);
      this.highlighted = true;
    } else {
      this.clearHighlight();
    }
  }

  /** Ends the highlight: nothing is dimmed any more. The selection stays as it is. */
  clearHighlight(): void {
    if (!this.highlighted) return;
    this.highlighted = false;
    highlightTree(this.diagram, null);
    // The Shape tool is back to the selected nodes alone.
    this.syncShapeScope();
  }

  /** For when other data is loaded: its nodes are new, and none of them is dimmed. */
  forgetHighlight(): void {
    this.highlighted = false;
  }

  private syncShapeScope(): void {
    const nodes = this.shapeTargets();
    if (nodes.length === 0) return this.shapeScope.set(null);
    const shared = nodes.every((node) => node.shape === nodes[0].shape) ? nodes[0].shape : null;
    this.shapeScope.set({ count: nodes.length, shape: shared, highlighted: this.highlighted });
  }
}
