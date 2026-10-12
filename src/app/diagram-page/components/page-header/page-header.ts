import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DIAGRAM_LIST_URL } from '../../../diagram-list/diagram-list';
import { DeveloperTools } from '../../developer-tools';
import { DiagramState } from '../../diagram-state/diagram-state';
import { OperationRunner } from '../../operation-runner/operation-runner';

/**
 * The bar at the top of the page: the way to the list of all diagrams, how
 * many legal entities the diagram has, what can be done with the diagram as a
 * whole (styles, export, print, reset, new), and the switch for the developer tools.
 *
 * It only says what was asked for; the page carries it out.
 */
@Component({
  selector: 'app-page-header',
  templateUrl: './page-header.html',
  styleUrl: './page-header.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
})
export class PageHeader {
  /** The diagram is to be read from the database again, as it is there. */
  readonly resetDiagram = output<void>();
  /** A new diagram is to be started, on an empty canvas. */
  readonly newDiagram = output<void>();
  readonly openStyles = output<void>();
  readonly exportPng = output<void>();
  readonly printDiagram = output<void>();

  protected readonly developerTools = inject(DeveloperTools);
  protected readonly busy = inject(OperationRunner).busy;
  /** True when the diagram has no nodes: there is nothing to style, export or print then. */
  protected readonly isEmpty = inject(DiagramState).isEmpty;
  private readonly stats = inject(DiagramState).stats;
  /** How many legal entities (nodes) the diagram has. */
  protected readonly nodeCount = computed(() => this.stats()?.nodes ?? 0);
  protected readonly listUrl = DIAGRAM_LIST_URL;

  /** Carries out what was picked in the Actions dropdown and puts the dropdown back. */
  protected runAction(menu: HTMLSelectElement): void {
    const action = menu.value;
    menu.value = '';
    if (action === 'export-png') this.exportPng.emit();
    if (action === 'print') this.printDiagram.emit();
  }
}
