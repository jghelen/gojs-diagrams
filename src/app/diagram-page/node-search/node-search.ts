import { Injectable, computed, signal } from '@angular/core';
import * as go from 'gojs/release/go';
import { NodeModel, showSearchHit } from '../../diagram/diagram-factory';

/**
 * The search for nodes by name: what was typed, which nodes match, and which
 * of them is being looked at.
 *
 * Searching only changes what is shown. It marks the node that is looked at
 * and brings it into view, and never alters the diagram or its history.
 */
@Injectable()
export class NodeSearch {
  /** What is typed into the search box. */
  readonly query = signal('');
  /** The keys of the nodes whose name contains it. */
  readonly matches = signal<number[]>([]);
  /** Which of the matches is being looked at; -1 before the first step. */
  readonly index = signal(-1);
  /** The text beside the search box: "3 found", "2 of 3", "No nodes found". */
  readonly summary = computed(() => {
    const found = this.matches().length;
    if (this.query().trim() === '') return '';
    if (found === 0) return 'No nodes found';
    return this.index() < 0 ? `${found} found` : `${this.index() + 1} of ${found}`;
  });

  private diagram!: go.Diagram;

  connect(diagram: go.Diagram): void {
    this.diagram = diagram;
  }

  /** Looks for the nodes whose name contains what was typed; no result is stepped to yet. */
  search(query: string): void {
    this.query.set(query);
    this.index.set(-1);
    showSearchHit(this.diagram, null);
    this.update();
  }

  /** Goes to the next or previous result: marks that node, centres on it and zooms in. */
  step(delta: 1 | -1): void {
    const matches = this.matches();
    if (matches.length === 0) return;
    const current = this.index();
    const next =
      current < 0
        ? delta > 0
          ? 0
          : matches.length - 1
        : (current + delta + matches.length) % matches.length;
    this.index.set(next);
    showSearchHit(this.diagram, this.diagram.findNodeForKey(matches[next]));
  }

  /** Stops looking at a particular result; the matches and their count stay. */
  leaveHit(): void {
    if (this.index() < 0) return;
    this.index.set(-1);
    showSearchHit(this.diagram, null);
  }

  /**
   * Works out the matches again. Called after every change to the diagram, since
   * renaming, adding, deleting and undo all alter which nodes match.
   */
  update(): void {
    const query = this.query().trim().toLowerCase();
    const lookingAt = this.matches()[this.index()];
    const nodes = (this.diagram.model as NodeModel).nodeDataArray;
    const matches = query
      ? nodes.filter((node) => node.title.toLowerCase().includes(query)).map((node) => node.key)
      : [];
    this.matches.set(matches);
    // Stay on the result that was being looked at, if it still matches.
    const index = lookingAt === undefined ? -1 : matches.indexOf(lookingAt);
    this.index.set(index);
    // The node that was being looked at no longer matches, or is gone.
    if (lookingAt !== undefined && index < 0) showSearchHit(this.diagram, null);
  }

  /** For when other data is loaded: what was searched for belonged to the old diagram. */
  clear(): void {
    this.query.set('');
    this.matches.set([]);
    this.index.set(-1);
  }
}
