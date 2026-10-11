import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { LAYOUTS, LayoutType } from '../../../diagram/layouts';
import { LINK_TYPES, LinkType, linkStyle } from '../../../diagram/link-types';
import { SHAPE_TILES } from '../../../diagram/shape-tiles';
import { DiagramActions } from '../../diagram-actions';
import { DiagramState } from '../../diagram-state/diagram-state';
import { OperationRunner } from '../../operation-runner/operation-runner';
import { SelectionState } from '../../selection-state/selection-state';

/**
 * The tools on the left edge of the canvas: add a node, undo and redo, zoom,
 * layout, line type, shape, auto arrange, and the cards of all relationships.
 *
 * Layout, Lines and Shape each open a column of icons to pick from; only one of
 * the three is open at a time.
 */
@Component({
  selector: 'app-tool-strip',
  templateUrl: './tool-strip.html',
  styleUrl: './tool-strip.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToolStrip {
  protected readonly actions = inject(DiagramActions);
  private readonly state = inject(DiagramState);
  private readonly selection = inject(SelectionState);

  protected readonly layouts = LAYOUTS;
  protected readonly linkTypes = LINK_TYPES;
  protected readonly shapeTiles = SHAPE_TILES;

  protected readonly busy = inject(OperationRunner).busy;
  protected readonly stats = this.state.stats;
  protected readonly isEmpty = this.state.isEmpty;
  protected readonly layoutType = this.state.layoutType;
  protected readonly linkType = this.state.linkType;
  protected readonly cardsExpanded = this.state.cardsExpanded;
  /** False when no relationship has a card: Expand all and Collapse all have nothing to do then. */
  protected readonly hasCards = this.state.hasCards;
  /** The nodes the Shape tool would change; null when there are none. */
  protected readonly shapeScope = this.selection.shapeScope;

  /** The layout in use, with its name and icon. */
  protected readonly currentLayout = computed(
    () => LAYOUTS.find((layout) => layout.type === this.layoutType()) ?? LAYOUTS[0],
  );
  /** The line type in use, with its name and icon. */
  protected readonly currentLinkStyle = computed(() => linkStyle(this.linkType()));

  /** Which of the columns of icons is open. */
  protected readonly layoutMenuOpen = signal(false);
  protected readonly linkMenuOpen = signal(false);
  protected readonly shapeMenuOpen = signal(false);

  /** The picture of the shape that all nodes of the Shape tool have; null when they differ. */
  protected readonly selectedShapeTile = computed(() => {
    const shape = this.shapeScope()?.shape;
    return SHAPE_TILES.find((tile) => tile.figure === shape) ?? null;
  });
  /** The hover text of the Shape tool: what its nodes have, or what to do first. */
  protected readonly shapeTip = computed(() => {
    const scope = this.shapeScope();
    if (!scope) return 'Shape: select nodes first';
    const shape = this.selectedShapeTile()?.label ?? 'mixed';
    return scope.highlighted
      ? `Shape of the ${scope.count} highlighted nodes: ${shape}`
      : `Shape: ${shape}`;
  });

  constructor() {
    // Shapes are picked for some nodes; without any, the column of shapes has nothing to do.
    effect(() => {
      if (!this.shapeScope()) this.shapeMenuOpen.set(false);
    });
  }

  /** Opens or closes one of the columns of icons; only one is open at a time. */
  protected toggleMenu(menu: 'layout' | 'lines' | 'shape'): void {
    const layout = menu === 'layout' && !this.layoutMenuOpen();
    const lines = menu === 'lines' && !this.linkMenuOpen();
    const shape = menu === 'shape' && !this.shapeMenuOpen();
    this.layoutMenuOpen.set(layout);
    this.linkMenuOpen.set(lines);
    this.shapeMenuOpen.set(shape);
  }

  /** Picks a layout from its column of icons, which then closes. */
  protected pickLayout(type: LayoutType): Promise<void> {
    this.layoutMenuOpen.set(false);
    return this.actions.changeLayout(type);
  }

  /** Picks a line type from its column of icons, which then closes. */
  protected pickLinkType(type: LinkType): Promise<void> {
    this.linkMenuOpen.set(false);
    return this.actions.changeLinkType(type);
  }

  /** Gives the nodes of the Shape tool the picked shape; its column of icons then closes. */
  protected pickShape(shape: string): Promise<void> {
    this.shapeMenuOpen.set(false);
    // Taken now: carrying out the change ends the highlight that says which nodes are meant.
    const nodes = this.selection.shapeTargets();
    return this.actions.setField(() => nodes, 'shape', shape);
  }

  /** The name of a line type as shown on hover. */
  protected linkTypeLabel(type: LinkType): string {
    return linkStyle(type).label;
  }

  protected zoomToFit(): void {
    // The whole diagram is to be seen, with nothing dimmed.
    this.selection.clearHighlight();
    this.actions.zoomToFit();
  }

  /** Shows the card of every relationship, with the nodes further apart to make room. */
  protected expandCards(): Promise<void> {
    return this.actions.showCards(true);
  }

  /** Hides the cards of all relationships and arranges the nodes close together again. */
  protected collapseCards(): Promise<void> {
    return this.actions.showCards(false);
  }
}
