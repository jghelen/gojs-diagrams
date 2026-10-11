import { Injectable, computed, signal } from '@angular/core';
import * as go from 'gojs/release/go';
import { DEFAULT_COLOR, DEFAULT_SHAPE, STYLE_FIELDS, StyleFieldId } from '../diagram/constants';
import { deleteIconCentre, textColorFor } from '../diagram/diagram-factory';
import { NodeData } from '../diagram/node-data';
import { SHAPE_TILES } from '../diagram/shape-tiles';

/** What the styles dialog will apply; null means "leave as it is". */
export interface StyleDraft {
  color: string | null;
  shape: go.FigureName | null;
}

/** The nodes of one legal entity type, as listed in the styles dialog. */
export interface StyleRow {
  type: string;
  count: number;
  /** The color and the shape they all share, or null where they differ. */
  color: string | null;
  shape: go.FigureName | null;
}

const NOTHING_PICKED: StyleDraft = { color: null, shape: null };

/** Where the value of each legal entity field is found on a node. */
const VALUE_OF: Record<StyleFieldId, (node: NodeData) => string> = {
  legalEntityType: (node) => node.legalEntityType,
};

/** The picture of a shape, as drawn on the tiles and in the previews of the dialog. */
function tileOf(shape: string | null) {
  return SHAPE_TILES.find((candidate) => candidate.figure === shape) ?? SHAPE_TILES[0];
}

/**
 * What the user has put together in the styles dialog: by which legal entity
 * field the nodes are grouped, which values of that field are ticked, and which
 * color and shape are picked for them.
 *
 * Nothing here changes the diagram. The dialog collects a choice; the page
 * applies it when Apply is pressed.
 */
@Injectable()
export class FundStyles {
  /** The legal entity field chosen in the dialog; null when none is. */
  readonly field = signal<StyleFieldId | null>(null);
  /** The field whose value the nodes of the diagram show as their subtitle right now. */
  readonly shownField = signal<StyleFieldId | null>(null);
  /** One row per value of that field in the diagram; none while no field is chosen. */
  readonly rows = signal<StyleRow[]>([]);
  /** The legal entity types that are ticked. */
  readonly types = signal<ReadonlySet<string>>(new Set());
  /** The color and shape picked but not applied yet. */
  readonly draft = signal<StyleDraft>(NOTHING_PICKED);

  readonly allTypesSelected = computed(
    () => this.rows().length > 0 && this.types().size === this.rows().length,
  );
  /** How many nodes the ticked legal entity types cover. */
  readonly nodeCount = computed(() => this.tickedRows().reduce((sum, row) => sum + row.count, 0));
  /**
   * A color and a shape are picked for values. So while no value is ticked there
   * is nothing to pick them for, and the dialog does not let the user.
   */
  readonly canPickStyle = computed(() => this.types().size > 0);
  /** True when Apply would give nodes a color or a shape: values are ticked and a style is picked. */
  readonly hasStyleToApply = computed(() => {
    const draft = this.draft();
    return this.nodeCount() > 0 && (draft.color !== null || draft.shape !== null);
  });
  /** True when Apply would change what the nodes show as their subtitle. */
  readonly hasFieldToApply = computed(() => this.field() !== this.shownField());
  /**
   * Apply needs something to do: another field to show on the nodes, a style for
   * ticked values, or both. Choosing a field alone is enough.
   */
  readonly canApply = computed(() => this.hasFieldToApply() || this.hasStyleToApply());
  /**
   * What a node will look like after Apply: the picked color and shape, and for
   * whatever was not picked, what the first ticked legal entity type has now.
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
      // What a node will show under its name: nothing while no field is chosen.
      subtitle: !this.field()
        ? null
        : ticked.length === 0
          ? 'Legal entity type'
          : ticked.length === 1
            ? ticked[0].type
            : `${ticked.length} legal entity types`,
    };
  });

  /** The nodes of the diagram as the dialog last saw them. */
  private nodes: readonly NodeData[] = [];

  private tickedRows(): StyleRow[] {
    return this.rows().filter((row) => this.types().has(row.type));
  }

  /**
   * Prepares the dialog for being opened: the field that the nodes show now is
   * the one chosen, with its values listed, and no style is picked yet.
   */
  open(nodes: readonly NodeData[], shownField: StyleFieldId | null): void {
    this.nodes = nodes;
    this.shownField.set(shownField);
    this.chooseField(shownField);
    this.clearDraft();
  }

  /**
   * Chooses the legal entity field to group the nodes by, or none. The values of
   * the field are then listed; what was ticked for another field is forgotten.
   */
  chooseField(field: string | null): void {
    const known = STYLE_FIELDS.find((candidate) => candidate.id === field);
    this.field.set(known ? known.id : null);
    this.setTypes(new Set());
    this.refresh(this.nodes);
  }

  /** Groups the nodes by the chosen field into the rows of the dialog. */
  refresh(nodes: readonly NodeData[]): void {
    this.nodes = nodes;
    const field = this.field();
    const rows = new Map<string, StyleRow>();
    for (const node of field ? nodes : []) {
      const value = VALUE_OF[field!](node);
      const row = rows.get(value);
      if (!row) {
        rows.set(value, {
          type: value,
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
    if (ticked.length !== this.types().size) this.setTypes(new Set(ticked));
  }

  /**
   * How a legal entity type's nodes look, for the small picture in its row. For a ticked
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

  /** Ticks or unticks one value. */
  toggleType(type: string): void {
    const types = new Set(this.types());
    if (!types.delete(type)) types.add(type);
    this.setTypes(types);
  }

  /** Ticks every value, or none. */
  selectAllTypes(all: boolean): void {
    this.setTypes(new Set(all ? this.rows().map((row) => row.type) : []));
  }

  /** With the last value unticked, the color and shape picked for the values go too. */
  private setTypes(types: ReadonlySet<string>): void {
    this.types.set(types);
    if (types.size === 0) this.clearDraft();
  }

  /**
   * Picks a color or shape for Apply; picking the same one again takes the choice
   * back. Does nothing while no value is ticked.
   */
  choose<F extends keyof StyleDraft>(field: F, value: StyleDraft[F]): void {
    if (!this.canPickStyle()) return;
    this.draft.update((draft) => ({
      ...draft,
      [field]: draft[field] === value ? null : value,
    }));
  }

  /** Forgets the picked color and shape; the ticked legal entity types stay. */
  clearDraft(): void {
    this.draft.set(NOTHING_PICKED);
  }

  /**
   * Forgets everything: the chosen field, what was ticked and what was picked,
   * so that the dialog starts afresh the next time it is opened.
   */
  clearAll(): void {
    this.chooseField(null);
    this.clearDraft();
  }
}
