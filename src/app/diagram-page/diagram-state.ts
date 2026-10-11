import { Injectable, computed, inject, signal } from '@angular/core';
import * as go from 'gojs/release/go';
import { DEFAULT_LAYOUT, DEFAULT_LINK_TYPE } from '../diagram/constants';
import { NodeModel } from '../diagram/diagram-factory';
import { HistoryService, StateCheck } from '../diagram/history.service';
import { LayoutType } from '../diagram/layouts';
import { LinkType } from '../diagram/link-types';

/** The numbers of the History panel. */
export interface Stats {
  nodes: number;
  links: number;
  historyLength: number;
  historyIndex: number;
  changedEvents: number;
  canUndo: boolean;
  canRedo: boolean;
  heapMb: number | null;
}

/**
 * What the page shows about the diagram as a whole: its settings, its name and
 * the numbers of its history.
 *
 * GoJS does not announce these one by one. An undo, for instance, puts back the
 * layout, the line type and the name without saying which of them changed. So
 * everything is read again from the diagram by `refresh()`, which the page calls
 * after every operation and after every change of the history.
 */
@Injectable()
export class DiagramState {
  private readonly history = inject(HistoryService);
  private diagram!: go.Diagram;

  readonly stats = signal<Stats | null>(null);
  /** Whether the diagram is back at its starting state, or at the state before an undo. */
  readonly stateCheck = signal<StateCheck>({ label: '', ok: null });
  /** True when the diagram has no nodes; zooming and arranging make no sense then. */
  readonly isEmpty = computed(() => (this.stats()?.nodes ?? 0) === 0);

  /** The layout and the line type in use. A newly loaded diagram keeps both. */
  readonly layoutType = signal<LayoutType>(DEFAULT_LAYOUT);
  readonly linkType = signal<LinkType>(DEFAULT_LINK_TYPE);
  /** The diagram's name and description, as shown in the bar above the canvas. */
  readonly name = signal('');
  readonly description = signal('');
  /** Whether every relationship shows its card in the diagram ("expand all"). */
  readonly cardsExpanded = signal(false);

  connect(diagram: go.Diagram): void {
    this.diagram = diagram;
  }

  /** Reads everything from the diagram and its history again. */
  refresh(): void {
    const model = this.diagram.model as NodeModel;
    const memory = (performance as { memory?: { usedJSHeapSize: number } }).memory;
    this.stats.set({
      nodes: model.nodeDataArray.length,
      links: model.linkDataArray.length,
      historyLength: this.history.length,
      historyIndex: this.history.position,
      changedEvents: this.history.recordedChanges,
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
      heapMb: memory ? memory.usedJSHeapSize / 1048576 : null,
    });
    this.stateCheck.set(this.history.describeState());

    const { layoutType, linkType, name, description, cardsExpanded } = model.modelData;
    this.layoutType.set(layoutType);
    this.linkType.set(linkType);
    this.name.set(name);
    this.description.set(description);
    this.cardsExpanded.set(cardsExpanded);
  }
}
