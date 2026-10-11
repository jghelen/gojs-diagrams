import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DIAGRAM_NAME_RULE, withoutSpecialCharacters } from '../../../diagram/diagram-name';
import { DiagramActions } from '../../diagram-actions';
import { DiagramState } from '../../diagram-state/diagram-state';
import { NodeSearch } from '../../node-search/node-search';
import { OperationRunner } from '../../operation-runner/operation-runner';

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

  /** The rule for names, in words. */
  protected readonly nameRule = DIAGRAM_NAME_RULE;
  /** True right after a character was refused in the name box, to say why it did not appear. */
  protected readonly nameRuleShown = signal(false);

  /**
   * Takes special characters out of the name box the moment they are typed or
   * pasted, so that a name with one in it can never be entered, and says why.
   * The cursor stays where the user was typing.
   */
  protected keepNameClean(input: HTMLInputElement): void {
    const clean = withoutSpecialCharacters(input.value);
    const refused = clean.length !== input.value.length;
    this.nameRuleShown.set(refused);
    if (!refused) return;
    const cursor = input.selectionStart ?? input.value.length;
    const cursorAfter = withoutSpecialCharacters(input.value.slice(0, cursor)).length;
    input.value = clean;
    input.setSelectionRange(cursorAfter, cursorAfter);
  }

  /** The name the opened diagram arrived with, if it was not valid; shown below the boxes. */
  protected readonly refusedName = this.state.refusedName;

  protected dismissRefusedName(): void {
    this.refusedName.set(null);
  }

  /** Takes over the name or description that was typed, as one undo step. */
  protected setDiagramInfo(field: 'name' | 'description', input: HTMLInputElement): Promise<void> {
    const typed = field === 'name' ? withoutSpecialCharacters(input.value) : input.value;
    const value = typed.trim();
    input.value = value;
    // With a name of the user's own, the note about the old one has done its job.
    if (field === 'name') this.dismissRefusedName();
    return this.actions.setDiagramInfo(field, value);
  }

  protected search(query: string): void {
    this.nodeSearch.search(query);
  }

  protected searchStep(delta: 1 | -1): void {
    this.nodeSearch.step(delta);
  }
}
