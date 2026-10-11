import { Injectable, inject } from '@angular/core';
import * as go from 'gojs/release/go';
import {
  DEFAULT_COLOR,
  DEFAULT_SHAPE,
  LEGAL_ENTITY_TYPES,
  STYLE_FIELDS,
  StyleFieldId,
} from '../diagram/constants';
import { NodeModel, addNodeInView } from '../diagram/diagram-factory';
import { HistoryService } from '../diagram/history.service';
import { LAYOUTS, LayoutType, createLayout, resetPortSpots } from '../diagram/layouts';
import { LinkType, linkStyle } from '../diagram/link-types';
import {
  EDITABLE_FIELDS,
  EditableField,
  LinkData,
  NodeData,
  randomPatch,
} from '../diagram/node-data';
import { Operation, OperationRunner, once } from './operation-runner';

/** "1 node", "3 nodes". */
function countOf(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * Everything that changes the diagram, and stepping through its history.
 *
 * Every method that changes something is one operation for the benchmark: it is
 * queued, timed and listed in the statistics by the OperationRunner. A change is
 * recorded through the HistoryService, as one transaction, so each call is one
 * undo step (the bulk edit is the exception: one step per run). Only zooming, at
 * the end, is neither: it changes how the diagram is looked at, not the diagram.
 *
 * The methods say what to change; they do not look at what is selected or at
 * any dialog. Whoever calls them passes the nodes or relationships meant.
 */
@Injectable()
export class DiagramActions {
  private readonly history = inject(HistoryService);
  private readonly runner = inject(OperationRunner);
  private diagram!: go.Diagram;

  connect(diagram: go.Diagram): void {
    this.diagram = diagram;
  }

  private get model(): NodeModel {
    return this.diagram.model as NodeModel;
  }

  // ----- Moving through the history -----

  undo(): Promise<void> {
    return this.runner.run(() => {
      // Saved before the clock starts: redoing everything is later checked against it.
      this.history.rememberLatestState();
      return {
        name: 'Undo',
        hasNext: once(() => this.history.canUndo),
        step: () => this.history.undo(),
      };
    });
  }

  redo(): Promise<void> {
    return this.runner.run(() => ({
      name: 'Redo',
      hasNext: once(() => this.history.canRedo),
      step: () => this.history.redo(),
    }));
  }

  /** Undoes one transaction after another until the diagram is as it was loaded. */
  undoAll(): Promise<void> {
    return this.runner.run(() => {
      this.history.rememberLatestState();
      return {
        name: 'Undo all',
        hasNext: () => this.history.canUndo,
        step: () => this.history.undo(),
        showBusyFirst: true,
      };
    });
  }

  /** Redoes one transaction after another until the diagram is at its newest state again. */
  redoAll(): Promise<void> {
    return this.runner.run(() => ({
      name: 'Redo all',
      hasNext: () => this.history.canRedo,
      step: () => this.history.redo(),
      showBusyFirst: true,
    }));
  }

  // ----- Nodes -----

  /**
   * Gives nodes new random values for all their fields, `runs` times over, each
   * run as one transaction. `pick` chooses the nodes among all of the diagram.
   */
  randomize(name: string, runs: number, pick: (all: NodeData[]) => NodeData[]): Promise<void> {
    return this.runner.run(() => {
      const nodes = pick(this.model.nodeDataArray);
      let remaining = runs;
      return {
        name,
        hasNext: () => remaining > 0,
        step: () => {
          remaining--;
          this.history.record('randomize', () => {
            for (const data of nodes) {
              const patch = randomPatch(data);
              for (const field of EDITABLE_FIELDS) this.model.set(data, field, patch[field]);
            }
          });
        },
        showBusyFirst: runs > 1,
      };
    });
  }

  /** Adds one new node in the middle of the view. */
  addNode(): Promise<void> {
    return this.runner.run(() => {
      // Higher than every key in use, including those of deleted nodes that
      // relationships still refer to, so the new node does not take over their lines.
      const key =
        Math.max(
          0,
          ...this.model.nodeDataArray.map((data) => data.key),
          ...this.model.linkDataArray.flatMap((link) => [link.from, link.to]),
        ) + 1;
      const node: NodeData = {
        key,
        title: `New fund ${key}`,
        legalEntityType: LEGAL_ENTITY_TYPES[0],
        shape: DEFAULT_SHAPE,
        color: DEFAULT_COLOR,
        comment: '',
      };
      return this.changing('Add node', true, () =>
        this.history.record('add node', () => addNodeInView(this.diagram, node)),
      );
    });
  }

  /** Sets `field` to `value` on the picked nodes that do not have it yet. */
  setField(pick: () => NodeData[], field: EditableField | 'comment', value: string): Promise<void> {
    return this.runner.run(() => {
      const nodes = pick().filter((data) => data[field] !== value);
      return this.changing(
        `Set ${field} on ${countOf(nodes.length, 'node', 'nodes')}`,
        nodes.length > 0,
        () =>
          this.history.record(`edit ${field}`, () => {
            for (const data of nodes) this.model.set(data, field, value);
          }),
      );
    });
  }

  /**
   * Applies what was put together in the styles dialog, as one undo step. It
   * can do either of two things, or both:
   *
   * - show the value of a legal entity field as the subtitle of every node
   *   (`field`; null shows none),
   * - give every node of the given types a color, a shape, or both (null leaves
   *   that one as it is).
   */
  applyStyle(
    field: StyleFieldId | null,
    types: ReadonlySet<string>,
    color: string | null,
    shape: go.FigureName | null,
  ): Promise<void> {
    return this.runner.run(() => {
      const nodes = this.model.nodeDataArray.filter(
        (node) =>
          types.has(node.legalEntityType) &&
          ((color !== null && node.color !== color) || (shape !== null && node.shape !== shape)),
      );
      const fieldChanges = field !== this.model.modelData.subtitleField;
      const label = STYLE_FIELDS.find((candidate) => candidate.id === field)?.label;
      const name =
        nodes.length > 0
          ? `Style ${countOf(nodes.length, 'node', 'nodes')}`
          : label
            ? `Show ${label.toLowerCase()} on nodes`
            : 'Hide subtitle on nodes';
      return this.changing(name, fieldChanges || nodes.length > 0, () =>
        this.history.record('apply styles', () => {
          if (fieldChanges) this.model.set(this.model.modelData, 'subtitleField', field);
          for (const node of nodes) {
            if (color !== null) this.model.set(node, 'color', color);
            if (shape !== null) this.model.set(node, 'shape', shape);
          }
        }),
      );
    });
  }

  /**
   * Takes back everything the styles dialog can do, as one undo step: every node
   * becomes a gray rectangle again, and no legal entity field is shown on the
   * nodes any more.
   */
  resetStyles(): Promise<void> {
    return this.runner.run(() => {
      const nodes = this.model.nodeDataArray.filter(
        (node) => node.shape !== DEFAULT_SHAPE || node.color !== DEFAULT_COLOR,
      );
      const fieldShown = this.model.modelData.subtitleField !== null;
      return this.changing('Reset styles', nodes.length > 0 || fieldShown, () =>
        this.history.record('reset styles', () => {
          if (fieldShown) this.model.set(this.model.modelData, 'subtitleField', null);
          for (const node of nodes) {
            this.model.set(node, 'shape', DEFAULT_SHAPE);
            this.model.set(node, 'color', DEFAULT_COLOR);
          }
        }),
      );
    });
  }

  /**
   * Deletes the nodes with these keys, and every relationship that starts or
   * ends at one of them, together with the given relationships. All other nodes
   * stay, and no relationship is created or re-attached.
   */
  deleteNodes(keys: number[], alsoLinks: LinkData[]): Promise<void> {
    return this.runner.run(() => {
      // Looked up now, in case something changed since the user was asked.
      const nodes = keys
        .map((key) => this.model.findNodeDataForKey(key))
        .filter((node) => node !== null);
      const found = new Set(nodes.map((node) => node.key));
      const links = this.model.linkDataArray.filter(
        (link) => found.has(link.from) || found.has(link.to) || alsoLinks.includes(link),
      );
      return this.changing(
        `Delete ${countOf(nodes.length, 'node', 'nodes')}`,
        nodes.length > 0,
        () =>
          this.history.record('delete', () => {
            this.model.removeLinkDataCollection(links);
            this.model.removeNodeDataCollection(nodes);
          }),
      );
    });
  }

  // ----- Relationships -----

  /** Removes the picked relationships. The nodes they joined stay. */
  removeLinks(pick: () => LinkData[]): Promise<void> {
    return this.runner.run(() => {
      const links = pick();
      return this.changing(
        `Remove ${countOf(links.length, 'relationship', 'relationships')}`,
        links.length > 0,
        () =>
          this.history.record('remove relationships', () =>
            this.model.removeLinkDataCollection(links),
          ),
      );
    });
  }

  // ----- The diagram as a whole -----

  /** Switches the layout: the new positions of the nodes are part of the undo step. */
  changeLayout(type: LayoutType): Promise<void> {
    const label = LAYOUTS.find((layout) => layout.type === type)?.label ?? type;
    return this.runner.run(() => ({
      ...this.changing(`Layout: ${label}`, type !== this.model.modelData.layoutType, () =>
        this.history.record('change layout', () => {
          this.model.set(this.model.modelData, 'layoutType', type);
          // While the cards of all relationships are shown, the nodes keep their room.
          this.arrangeWith(type, this.model.modelData.cardsExpanded);
        }),
      ),
      showBusyFirst: true,
    }));
  }

  /**
   * Runs the current layout again, which tidies the diagram after nodes were
   * dragged or relationships removed.
   */
  autoArrange(): Promise<void> {
    return this.runner.run(() => ({
      ...this.changing('Auto arrange', true, () => {
        this.history.record('auto arrange', () => {
          resetPortSpots(this.diagram);
          this.diagram.layoutDiagram(true);
        });
        this.zoomToFitSoon();
      }),
      showBusyFirst: true,
    }));
  }

  /**
   * Shows the card of every relationship, or hides them all. The nodes are
   * arranged anew: further apart while the cards are shown, so that the cards
   * fit between them, and close together again afterwards. One undo step,
   * because an undo has to bring back the places and the cards together.
   */
  showCards(shown: boolean): Promise<void> {
    return this.runner.run(() => ({
      ...this.changing(
        shown ? 'Expand all' : 'Collapse all',
        shown !== this.model.modelData.cardsExpanded,
        () => {
          this.history.record(shown ? 'expand all' : 'collapse all', () => {
            this.model.set(this.model.modelData, 'cardsExpanded', shown);
            this.arrangeWith(this.model.modelData.layoutType, shown);
          });
          this.zoomToFitSoon();
        },
      ),
      showBusyFirst: true,
    }));
  }

  /** Switches the line type of every relationship; the new routes are recorded too. */
  changeLinkType(type: LinkType): Promise<void> {
    return this.runner.run(() => ({
      ...this.changing(
        `Lines: ${linkStyle(type).label}`,
        type !== this.model.modelData.linkType,
        () =>
          this.history.record('change line type', () =>
            this.model.set(this.model.modelData, 'linkType', type),
          ),
      ),
      showBusyFirst: true,
    }));
  }

  /** Gives the diagram a new name or description. */
  setDiagramInfo(field: 'name' | 'description', value: string): Promise<void> {
    return this.runner.run(() =>
      this.changing(
        field === 'name' ? 'Rename diagram' : 'Describe diagram',
        value !== this.model.modelData[field],
        () =>
          this.history.record(`edit ${field}`, () =>
            this.model.set(this.model.modelData, field, value),
          ),
      ),
    );
  }

  // ----- The view: zooming changes nothing in the diagram, so it is neither recorded nor timed -----

  zoomIn(): void {
    this.diagram.commandHandler.increaseZoom();
  }

  zoomOut(): void {
    this.diagram.commandHandler.decreaseZoom();
  }

  /** Shows the whole diagram. */
  zoomToFit(): void {
    this.diagram.zoomToFit();
  }

  /** Fits the diagram once GoJS has recomputed its bounds, which it does in its next frame. */
  zoomToFitSoon(): void {
    requestAnimationFrame(() => this.diagram.zoomToFit());
  }

  // ----- Internals -----

  /**
   * An operation of one step that records one transaction. With `needed` false
   * there is nothing to change, so nothing is done, recorded or listed.
   */
  private changing(name: string, needed: boolean, change: () => void): Operation {
    return { name, hasNext: once(() => needed), step: change };
  }

  /**
   * Arranges the nodes with a layout of that type, with or without room for
   * relationship cards between them. Call this inside the transaction: GoJS
   * records the new layout too, so undo and redo swap the layout object back.
   */
  private arrangeWith(type: LayoutType, roomForCards: boolean): void {
    const layout = createLayout(type, this.diagram.nodes.count, roomForCards);
    resetPortSpots(this.diagram);
    this.diagram.layout = layout;
    // Layouts do not run by themselves after every change, so ask for this one run.
    layout.isValidLayout = false;
  }
}
