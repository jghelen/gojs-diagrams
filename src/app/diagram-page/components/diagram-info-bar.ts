import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DiagramActions } from '../diagram-actions';
import { DiagramState } from '../diagram-state';
import { NodeSearch } from '../node-search';
import { OperationRunner } from '../operation-runner';

/** The bar above the canvas: the diagram's name and description, and the search for nodes. */
@Component({
  selector: 'app-diagram-info-bar',
  templateUrl: './diagram-info-bar.html',
  styleUrl: './diagram-info-bar.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DiagramInfoBar {
  private readonly actions = inject(DiagramActions);
  private readonly state = inject(DiagramState);
  private readonly nodeSearch = inject(NodeSearch);

  protected readonly busy = inject(OperationRunner).busy;
  /** True when the diagram has no nodes: there is nothing to search then. */
  protected readonly isEmpty = this.state.isEmpty;
  protected readonly diagramName = this.state.name;
  protected readonly diagramDescription = this.state.description;
  protected readonly searchQuery = this.nodeSearch.query;
  protected readonly searchMatches = this.nodeSearch.matches;
  protected readonly searchSummary = this.nodeSearch.summary;

  /** Takes over the name or description that was typed, as one undo step. */
  protected setDiagramInfo(field: 'name' | 'description', input: HTMLInputElement): Promise<void> {
    const value = input.value.trim();
    input.value = value;
    return this.actions.setDiagramInfo(field, value);
  }

  protected search(query: string): void {
    this.nodeSearch.search(query);
  }

  protected searchStep(delta: 1 | -1): void {
    this.nodeSearch.step(delta);
  }
}
