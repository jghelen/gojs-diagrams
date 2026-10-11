import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  linkedSignal,
  output,
} from '@angular/core';
import { BULK_EDIT_BUDGET, COLORS } from '../../diagram/constants';
import { EditableField } from '../../diagram/node-data';
import { DeveloperTools } from '../developer-tools';
import { DiagramActions } from '../diagram-actions';
import { DiagramState } from '../diagram-state';
import { OperationRunner } from '../operation-runner';
import { SelectionState } from '../selection-state';

/** How many bulk runs the box suggests at first. */
const DEFAULT_BULK_RUNS = 50;

/**
 * The panel on the right: what can be done with the selected relationships and
 * nodes. With the developer tools shown, it starts with the numbers of the undo
 * history and the random edits of the benchmark.
 */
@Component({
  selector: 'app-side-panel',
  templateUrl: './side-panel.html',
  styleUrl: './side-panel.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidePanel {
  private readonly actions = inject(DiagramActions);
  private readonly state = inject(DiagramState);
  private readonly selection = inject(SelectionState);

  /** The selected nodes are to be deleted. The page asks for confirmation first. */
  readonly deleteNodes = output<void>();

  protected readonly developerTools = inject(DeveloperTools);
  protected readonly colors = COLORS;
  protected readonly busy = inject(OperationRunner).busy;
  protected readonly stats = this.state.stats;
  protected readonly stateCheck = this.state.stateCheck;
  protected readonly selected = this.selection.selected;
  protected readonly selectedLinks = this.selection.selectedLinks;
  protected readonly linksOfSelectedNodes = this.selection.linksOfSelectedNodes;

  /**
   * Most runs the bulk edit accepts: the number of nodes in the diagram, and
   * fewer on big diagrams, where that many runs would block the page for minutes.
   */
  protected readonly maxBulkRuns = computed(() => {
    const nodes = this.stats()?.nodes;
    // Until the diagram has been read for the first time, nothing limits the suggestion.
    if (nodes === undefined) return DEFAULT_BULK_RUNS;
    return Math.max(1, Math.min(nodes, Math.floor(BULK_EDIT_BUDGET / nodes)));
  });
  /**
   * How many runs the bulk edit does. The limit follows the node count, so a
   * number typed for a bigger diagram is lowered when the limit drops below it.
   */
  protected readonly bulkRuns = linkedSignal<number, number>({
    source: this.maxBulkRuns,
    computation: (max, previous) => Math.min(previous?.value ?? DEFAULT_BULK_RUNS, max),
  });

  // ----- Random edits for the benchmark -----

  protected randomizeOne(): Promise<void> {
    return this.actions.randomize('Randomize 1 node', 1, (nodes) => [
      nodes[Math.floor(Math.random() * nodes.length)],
    ]);
  }

  protected randomizeAll(): Promise<void> {
    // Every field of every node, and another layout: the biggest single change there is.
    return this.actions.randomize('Randomize all nodes', 1, (nodes) => nodes, { layout: true });
  }

  protected runBulk(): Promise<void> {
    const runs = this.validBulkRuns(this.bulkRuns());
    this.bulkRuns.set(runs);
    // No new layout per run here: many layouts in a row would take far too long.
    return this.actions.randomize(`${runs} × randomize all nodes`, runs, (nodes) => nodes, {
      move: true,
    });
  }

  /** Takes over what was typed into the bulk-runs box, corrected to a usable number. */
  protected setBulkRuns(input: HTMLInputElement): void {
    const runs = this.validBulkRuns(Number(input.value));
    this.bulkRuns.set(runs);
    // Also when the signal did not change, so that a rejected entry does not stay in the box.
    input.value = String(runs);
  }

  /** A whole number from 1 to maxBulkRuns; anything that is not a number counts as 1. */
  private validBulkRuns(value: number): number {
    if (!Number.isFinite(value)) return 1;
    return Math.min(this.maxBulkRuns(), Math.max(1, Math.floor(value)));
  }

  // ----- The selection -----

  /** Sets one field on every selected node, as a single undo step. */
  protected editSelected(field: EditableField, value: string): Promise<void> {
    return this.actions.setField(() => this.selection.selectedNodes(), field, value);
  }

  /** Removes the relationships that are selected themselves. */
  protected removeSelectedLinks(): Promise<void> {
    return this.actions.removeLinks(() => this.selection.selectedLinkData());
  }

  /** Removes every relationship that starts or ends at one of the selected nodes. */
  protected removeLinksOfSelectedNodes(): Promise<void> {
    return this.actions.removeLinks(() => this.selection.linkDataOfSelectedNodes());
  }
}
