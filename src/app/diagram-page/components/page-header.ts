import { ChangeDetectionStrategy, Component, VERSION, inject, input, output } from '@angular/core';
import * as go from 'gojs/release/go';
import { BLANK_DATASET } from '../../diagram/constants';
import { DATASETS } from '../../diagram/datasets';
import { DiagramState } from '../diagram-state';
import { OperationRunner } from '../operation-runner';

/**
 * The bar at the top of the page: which data the diagram shows, and what can be
 * done with the diagram as a whole (styles, export, print, reset, new).
 *
 * It only says what was asked for; the page carries it out.
 */
@Component({
  selector: 'app-page-header',
  templateUrl: './page-header.html',
  styleUrl: './page-header.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageHeader {
  /** Id of the dataset the diagram was loaded with. */
  readonly datasetId = input.required<string>();

  /** A dataset was picked, the diagram is to be reset, or a new one started: load this dataset. */
  readonly loadDataset = output<string>();
  readonly openStyles = output<void>();
  readonly exportPng = output<void>();
  readonly printDiagram = output<void>();

  protected readonly busy = inject(OperationRunner).busy;
  /** True when the diagram has no nodes: there is nothing to style, export or print then. */
  protected readonly isEmpty = inject(DiagramState).isEmpty;
  protected readonly angularVersion = VERSION.full;
  protected readonly gojsVersion = go.Diagram.version;
  protected readonly datasets = DATASETS;
  /** The dataset with nothing in it: what "New diagram" loads. */
  protected readonly blankDataset = BLANK_DATASET;

  /** Carries out what was picked in the Actions dropdown and puts the dropdown back. */
  protected runAction(menu: HTMLSelectElement): void {
    const action = menu.value;
    menu.value = '';
    if (action === 'export-png') this.exportPng.emit();
    if (action === 'print') this.printDiagram.emit();
  }
}
