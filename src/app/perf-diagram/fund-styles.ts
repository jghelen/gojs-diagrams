import { Injectable, computed, signal } from '@angular/core';
import * as go from 'gojs/release/go';
import { DEFAULT_COLOR, DEFAULT_SHAPE } from '../diagram/constants';
import { deleteIconCentre, textColorFor } from '../diagram/diagram-factory';
import { NodeData } from '../diagram/node-data';
import { SHAPE_TILES } from '../diagram/shape-tiles';

/** What the styles dialog will apply; null means "leave as it is". */
export interface StyleDraft {
  color: string | null;
  shape: go.FigureName | null;
}

/** The nodes of one fund type, as listed in the styles dialog. */
export interface StyleRow {
  type: string;
  count: number;
  /** The color and the shape they all share, or null where they differ. */
  color: string | null;
  shape: go.FigureName | null;
}

const NOTHING_PICKED: StyleDraft = { color: null, shape: null };

/** The picture of a shape, as drawn on the tiles and in the previews of the dialog. */
function tileOf(shape: string | null) {
  return SHAPE_TILES.find((candidate) => candidate.figure === shape) ?? SHAPE_TILES[0];
}

/**
 * What the user has put together in the styles dialog: which fund types are
 * ticked, and which color and shape are picked for them.
 *
 * Nothing here changes the diagram. The dialog collects a choice; the page
 * applies it when Apply is pressed.
 */
@Injectable()
export class FundStyles {
  /** One row per fund type in the diagram. */
  readonly rows = signal<StyleRow[]>([]);
  /** The fund types that are ticked. */
  readonly types = signal<ReadonlySet<string>>(new Set());
  /** The color and shape picked but not applied yet. */
  readonly draft = signal<StyleDraft>(NOTHING_PICKED);

  readonly allTypesSelected = computed(
    () => this.rows().length > 0 && this.types().size === this.rows().length,
  );
  /** How many nodes the ticked fund types cover. */
  readonly nodeCount = computed(() => this.tickedRows().reduce((sum, row) => sum + row.count, 0));
  /** Apply needs at least one fund type and at least a color or a shape. */
  readonly canApply = computed(() => {
    const draft = this.draft();
    return this.nodeCount() > 0 && (draft.color !== null || draft.shape !== null);
  });
  /**
   * What a node will look like after Apply: the picked color and shape, and for
   * whatever was not picked, what the first ticked fund type has now.
   */
  readonly nodePreview = computed(() => {
    const ticked = this.tickedRows();
    const draft = this.draft();
    const shape = draft.shape ?? ticked[0]?.shape ?? DEFAULT_SHAPE;
    const color = draft.color ?? ticked[0]?.color ?? DEFAULT_COLOR;
    return {
      path: tileOf(shape).path,
      fill: color,
      // A diamond comes to a point on the left, so its arrows sit further in, as in the diagram.
      arrowsLeft: shape === 'Diamond' ? 24 : 8,
      // The delete icon sits where it does in the diagram, which depends on the shape.
      deleteIcon: deleteIconCentre(shape),
      textColor: textColorFor(color),
      subtitle:
        ticked.length === 0
          ? 'Fund type'
          : ticked.length === 1
            ? ticked[0].type
            : `${ticked.length} fund types`,
    };
  });

  private tickedRows(): StyleRow[] {
    return this.rows().filter((row) => this.types().has(row.type));
  }

  /** Groups the nodes by fund type (their subtitle) into the rows of the dialog. */
  refresh(nodes: readonly NodeData[]): void {
    const rows = new Map<string, StyleRow>();
    for (const node of nodes) {
      const row = rows.get(node.subtitle);
      if (!row) {
        rows.set(node.subtitle, {
          type: node.subtitle,
          count: 1,
          color: node.color,
          shape: node.shape,
        });
        continue;
      }
      row.count++;
      if (row.color !== node.color) row.color = null;
      if (row.shape !== node.shape) row.shape = null;
    }
    this.rows.set([...rows.values()].sort((a, b) => a.type.localeCompare(b.type)));
    // A type that no node has any more cannot stay ticked.
    const ticked = [...this.types()].filter((type) => rows.has(type));
    if (ticked.length !== this.types().size) this.types.set(new Set(ticked));
  }

  /**
   * How a fund type's nodes look, for the small picture in its row. For a ticked
   * type this already includes the color and shape picked but not yet applied.
   */
  previewOf(row: StyleRow): { path: string; fill: string; mixed: boolean } {
    const draft = this.types().has(row.type) ? this.draft() : null;
    const shape = draft?.shape ?? row.shape;
    const color = draft?.color ?? row.color;
    return {
      path: tileOf(shape).path,
      fill: color ?? '#ffffff',
      mixed: shape === null || color === null,
    };
  }

  /** Ticks or unticks one fund type. */
  toggleType(type: string): void {
    const types = new Set(this.types());
    if (!types.delete(type)) types.add(type);
    this.types.set(types);
  }

  /** Ticks every fund type, or none. */
  selectAllTypes(all: boolean): void {
    this.types.set(new Set(all ? this.rows().map((row) => row.type) : []));
  }

  /** Picks a color or shape for Apply; picking the same one again takes the choice back. */
  choose<F extends keyof StyleDraft>(field: F, value: StyleDraft[F]): void {
    this.draft.update((draft) => ({
      ...draft,
      [field]: draft[field] === value ? null : value,
    }));
  }

  /** Forgets the picked color and shape; the ticked fund types stay. */
  clearDraft(): void {
    this.draft.set(NOTHING_PICKED);
  }

  /** Forgets everything, so that the dialog starts afresh the next time it is opened. */
  clearAll(): void {
    this.types.set(new Set());
    this.clearDraft();
  }
}
