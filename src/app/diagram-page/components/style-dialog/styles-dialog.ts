import { ChangeDetectionStrategy, Component, ElementRef, inject, viewChild } from '@angular/core';
import { COLORS, STYLE_FIELDS } from '../../../diagram/constants';
import { SHAPE_TILES } from '../../../diagram/shape-tiles';
import { DiagramActions } from '../../diagram-actions';
import { FundStyles, StyleDraft, StyleRow } from '../../fund-styles';
import { OperationRunner } from '../../operation-runner/operation-runner';

/**
 * The dialog "Styles by legal entity field": pick a field, tick some of its
 * values, and give the nodes with those values a color and a shape. With it
 * comes the question that is asked before all styles are reset.
 *
 * What is ticked and picked is kept by the FundStyles service; nothing in the
 * diagram changes until Apply or Reset is pressed.
 */
@Component({
  selector: 'app-styles-dialog',
  templateUrl: './styles-dialog.html',
  styleUrl: './styles-dialog.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StylesDialog {
  private readonly actions = inject(DiagramActions);
  private readonly styles = inject(FundStyles);

  protected readonly colors = COLORS;
  protected readonly shapeTiles = SHAPE_TILES;
  protected readonly styleFields = STYLE_FIELDS;

  protected readonly busy = inject(OperationRunner).busy;
  /** The legal entity field the nodes are grouped by; null until one is chosen. */
  protected readonly styleField = this.styles.field;
  protected readonly styleRows = this.styles.rows;
  protected readonly styleTypes = this.styles.types;
  protected readonly styleDraft = this.styles.draft;
  protected readonly allStyleTypesSelected = this.styles.allTypesSelected;
  protected readonly styleNodeCount = this.styles.nodeCount;
  protected readonly nodePreview = this.styles.nodePreview;
  protected readonly canApplyStyle = this.styles.canApply;
  /** Color and shape can only be picked once a value of the field is ticked. */
  protected readonly canPickStyle = this.styles.canPickStyle;

  private readonly stylesDialog = viewChild.required<ElementRef<HTMLDialogElement>>('stylesDialog');
  private readonly resetDialog = viewChild.required<ElementRef<HTMLDialogElement>>('resetDialog');

  /** Whether the dialog is on screen. */
  get isOpen(): boolean {
    return this.stylesDialog().nativeElement.open;
  }

  /** Shows the dialog. The page first tells FundStyles which nodes there are. */
  show(): void {
    this.stylesDialog().nativeElement.showModal();
  }

  protected closeStyles(): void {
    this.stylesDialog().nativeElement.close();
  }

  /** Takes over the field picked in the dropdown; "" means none. */
  protected chooseStyleField(field: string): void {
    this.styles.chooseField(field || null);
  }

  protected stylePreview(row: StyleRow): { path: string; fill: string; mixed: boolean } {
    return this.styles.previewOf(row);
  }

  protected toggleStyleType(type: string): void {
    this.styles.toggleType(type);
  }

  protected selectAllStyleTypes(all: boolean): void {
    this.styles.selectAllTypes(all);
  }

  protected chooseStyle<F extends keyof StyleDraft>(field: F, value: StyleDraft[F]): void {
    this.styles.choose(field, value);
  }

  /**
   * Applies the dialog as one undo step and closes it: the chosen field is shown
   * as the subtitle of every node, and the nodes of the ticked values get the
   * picked color and shape. Either of the two can be done alone.
   */
  protected applyStyles(): Promise<void> {
    const field = this.styleField();
    const types = this.styleTypes();
    const { color, shape } = this.styleDraft();
    this.closeStyles();
    return this.actions.applyStyle(field, types, color, shape).then(() => this.styles.clearDraft());
  }

  /** Asks before resetting every node's style. */
  protected askToResetStyles(): void {
    this.resetDialog().nativeElement.showModal();
  }

  protected cancelResetStyles(): void {
    this.resetDialog().nativeElement.close();
  }

  /**
   * Resets every node's style, unselects the legal entity field, and closes both
   * dialogs, so the styles dialog starts afresh next time.
   */
  protected confirmResetStyles(): Promise<void> {
    this.cancelResetStyles();
    this.closeStyles();
    this.styles.clearAll();
    return this.actions.resetStyles();
  }
}
