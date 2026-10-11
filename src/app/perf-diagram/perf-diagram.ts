import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  VERSION,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import * as go from 'gojs/release/go';
import { afterNextPaint, timeSteps } from '../diagram/benchmark';
import {
  NodeModel,
  addNodeInView,
  createDiagram,
  createModel,
  highlightTree,
  showModel,
} from '../diagram/diagram-factory';
import { DATASETS, DEFAULT_DATASET, findDataset } from '../diagram/datasets';
import {
  DEFAULT_LAYOUT,
  LAYOUTS,
  LayoutType,
  createLayout,
  resetPortSpots,
} from '../diagram/layouts';
import { newBatchUrl } from '../new-batch/new-batch';
import {
  DEFAULT_LINK_TYPE,
  LINK_TYPES,
  LinkType,
  avoidsNodes,
  linkStyle,
} from '../diagram/link-types';
import {
  COLORS,
  EDITABLE_FIELDS,
  EditableField,
  LinkData,
  NodeData,
  SHAPES,
  randomPatch,
} from '../diagram/node-data';

interface Stats {
  nodes: number;
  links: number;
  historyLength: number;
  historyIndex: number;
  changedEvents: number;
  canUndo: boolean;
  canRedo: boolean;
  heapMb: number | null;
}

interface LogEntry {
  id: number;
  op: string;
  steps: number;
  changes: number;
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  /** From the start of the operation until the result was painted; null if the tab was hidden. */
  paintMs: number | null;
}

interface StateCheck {
  label: string;
  /** true/false when compared against a snapshot, null when there is nothing to compare with. */
  ok: boolean | null;
}

/** The selected nodes: per field, the value they all share, or null where they differ. */
type Selection = { count: number } & { [F in EditableField]: NodeData[F] | null };

interface LinkInfo {
  link: LinkData;
  from: NodeData | null;
  to: NodeData | null;
  /** The link's data object as stored in the model. */
  json: string;
}

/** First and last index into UndoManager.history, inclusive. */
type HistoryRange = [first: number, last: number];

interface Operation {
  /** Shown in the timing log. */
  name: string;
  hasNext: () => boolean;
  step: () => void;
  /** The history entries this operation commits, undoes or redoes. */
  range: HistoryRange;
  showBusyFirst?: boolean;
}

const MAX_LOG_ENTRIES = 30;

/** Upper limit for runs × nodes of one bulk edit; beyond it the page is blocked for too long. */
const BULK_EDIT_BUDGET = 40_000;

/** Largest node count that is loaded with a line type that is routed around the nodes. */
const AVOID_NODES_LIMIT = 500;

@Component({
  selector: 'app-perf-diagram',
  templateUrl: './perf-diagram.html',
  styleUrl: './perf-diagram.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PerfDiagram {
  protected readonly angularVersion = VERSION.full;
  protected readonly gojsVersion = go.Diagram.version;
  protected readonly datasets = DATASETS;
  protected readonly layouts = LAYOUTS;
  protected readonly linkTypes = LINK_TYPES;
  protected readonly shapes = SHAPES;
  protected readonly colors = COLORS;

  /** Id of the dataset the diagram was loaded with. */
  protected readonly datasetId = signal(DEFAULT_DATASET);
  protected readonly layoutType = signal<LayoutType>(DEFAULT_LAYOUT);
  protected readonly linkType = signal<LinkType>(DEFAULT_LINK_TYPE);
  protected readonly bulkRuns = signal(50);
  /**
   * Most runs the bulk edit accepts: the number of nodes in the diagram, and
   * fewer on big diagrams, where that many runs would block the page for minutes.
   */
  protected readonly maxBulkRuns = computed(() => {
    const nodes = this.stats()?.nodes ?? 1;
    return Math.max(1, Math.min(nodes, Math.floor(BULK_EDIT_BUDGET / nodes)));
  });
  /** True while an operation runs, and from loading a model until its initial layout is done. */
  protected readonly busy = signal(true);
  protected readonly stats = signal<Stats | null>(null);
  protected readonly stateCheck = signal<StateCheck>({ label: '', ok: null });
  protected readonly selected = signal<Selection | null>(null);
  /** Number of relationships selected directly. */
  protected readonly selectedLinks = signal(0);
  /** Number of relationships attached to the selected nodes. */
  protected readonly linksOfSelectedNodes = signal(0);
  protected readonly log = signal<LogEntry[]>([]);

  /** The node whose comment is being edited in the comment dialog. */
  protected readonly commentTarget = signal<NodeData | null>(null);
  /** The node whose color is being chosen in the color dialog. */
  protected readonly colorTarget = signal<NodeData | null>(null);
  /** The relationship shown in the info dialog. */
  protected readonly linkInfo = signal<LinkInfo | null>(null);

  private readonly host = viewChild.required<ElementRef<HTMLDivElement>>('diagramHost');
  private readonly linkDialog = viewChild.required<ElementRef<HTMLDialogElement>>('linkDialog');
  private readonly colorDialog = viewChild.required<ElementRef<HTMLDialogElement>>('colorDialog');
  private readonly commentDialog =
    viewChild.required<ElementRef<HTMLDialogElement>>('commentDialog');
  private diagram!: go.Diagram;
  /** Model JSON after the initial layout: what "undo all" has to get back to. */
  private initialJson: string | null = null;
  /** Model JSON at the newest transaction, captured before undoing away from it. */
  private tipJson: string | null = null;
  /** True while a timed operation runs, so the model listener adds nothing to the measurement. */
  private measuring = false;
  private nextLogId = 1;
  /** True while a node's tree is highlighted and the rest of the diagram dimmed. */
  private highlighted = false;
  private queue: Promise<void> = Promise.resolve();

  constructor() {
    afterNextRender(() => this.init());
    inject(DestroyRef).onDestroy(() => {
      if (this.diagram) this.diagram.div = null;
    });
  }

  private get model(): NodeModel {
    return this.diagram.model as NodeModel;
  }

  private get undoManager(): go.UndoManager {
    return this.diagram.model.undoManager;
  }

  private init(): void {
    this.diagram = createDiagram(this.host().nativeElement, {
      onLinkInfo: (link) => this.showLinkInfo(link),
      onNodeColor: (node) => this.showColorPicker(node),
      onNodeComment: (node) => this.showComment(node),
      // A new tab, so the diagram and its undo history stay as they are.
      onNodeBatch: (node) => openInNewTab(newBatchUrl(node.key)),
    });

    // Route Ctrl/Cmd+Z and Ctrl/Cmd+Y through the timed versions.
    this.diagram.commandHandler.undo = () => void this.undo();
    this.diagram.commandHandler.redo = () => void this.redo();
    // Same for the Delete key, which only ever removes relationships.
    this.diagram.commandHandler.deleteSelection = () => void this.removeSelectedLinks();

    // Picks up transactions committed by GoJS itself (dragging, in-place text editing).
    this.diagram.addModelChangedListener((e) => {
      if (!e.isTransactionFinished || this.measuring) return;
      if (e.propertyName === 'CommittedTransaction' && e.object) this.tipJson = null;
      this.refresh();
    });
    // GoJS commits the initial layout as a transaction and then clears the history
    // without raising a model event; "Modified" is what fires once that is done.
    this.diagram.addDiagramListener('Modified', () => {
      if (!this.measuring) this.refresh();
    });
    // The initial layout writes every node's `loc`, so the snapshot is taken after it.
    this.diagram.addDiagramListener('InitialLayoutCompleted', () => {
      this.initialJson = this.model.toJson();
      this.busy.set(false);
    });
    this.diagram.addDiagramListener('ChangedSelection', () => {
      this.syncSelection();
      this.highlightSelectedTree();
    });
    // Zooming by wheel or pinch counts as an action that ends the highlight.
    this.diagram.addDiagramListener('ViewportBoundsChanged', (e) => {
      if (e.subject.scale !== this.diagram.scale) this.clearHighlight();
    });

    this.loadModel(this.datasetId());
    this.refresh();
  }

  // ----- history -----

  protected undo(): Promise<void> {
    return this.measure(() => {
      const um = this.undoManager;
      this.captureTip();
      const index = um.historyIndex;
      return {
        name: 'Undo',
        hasNext: once(() => um.canUndo()),
        step: () => um.undo(),
        range: [index, index],
      };
    });
  }

  protected redo(): Promise<void> {
    return this.measure(() => {
      const um = this.undoManager;
      const index = um.historyIndex + 1;
      return {
        name: 'Redo',
        hasNext: once(() => um.canRedo()),
        step: () => um.redo(),
        range: [index, index],
      };
    });
  }

  protected undoAll(): Promise<void> {
    return this.measure(() => {
      const um = this.undoManager;
      this.captureTip();
      return {
        name: 'Undo all',
        hasNext: () => um.canUndo(),
        step: () => um.undo(),
        range: [0, um.historyIndex],
        showBusyFirst: true,
      };
    });
  }

  protected redoAll(): Promise<void> {
    return this.measure(() => {
      const um = this.undoManager;
      return {
        name: 'Redo all',
        hasNext: () => um.canRedo(),
        step: () => um.redo(),
        range: [um.historyIndex + 1, um.history.count - 1],
        showBusyFirst: true,
      };
    });
  }

  // ----- edits -----

  protected randomizeOne(): Promise<void> {
    return this.measureEdit('Randomize 1 node', 1, (nodes) => [
      nodes[Math.floor(Math.random() * nodes.length)],
    ]);
  }

  protected randomizeAll(): Promise<void> {
    return this.measureEdit('Randomize all nodes', 1, (nodes) => nodes);
  }

  protected runBulk(): Promise<void> {
    // The limit may have dropped since the number was typed, e.g. after loading a bigger diagram.
    const runs = this.validBulkRuns(this.bulkRuns());
    this.bulkRuns.set(runs);
    return this.measureEdit(`${runs} × randomize all nodes`, runs, (nodes) => nodes);
  }

  /** Takes over what was typed into the bulk-runs box, corrected to a usable number. */
  protected setBulkRuns(input: HTMLInputElement): void {
    const runs = this.validBulkRuns(Number(input.value));
    this.bulkRuns.set(runs);
    // Also when the signal did not change, so that a rejected entry does not stay in the box.
    input.value = String(runs);
  }

  /** A whole number from 1 to maxBulkRuns; anything that is not a number counts as 1. */
  private validBulkRuns(value: number): number {
    if (!Number.isFinite(value)) return 1;
    return Math.min(this.maxBulkRuns(), Math.max(1, Math.floor(value)));
  }

  /** Adds one new node in the middle of the view, as a single transaction. */
  protected addNode(): Promise<void> {
    return this.measure(() => {
      const key = Math.max(0, ...this.model.nodeDataArray.map((data) => data.key)) + 1;
      const node: NodeData = {
        key,
        title: `New node ${key}`,
        subtitle: 'draft',
        shape: SHAPES[0],
        color: COLORS[0],
        comment: '',
      };
      return this.newTransactions(
        'Add node',
        once(() => true),
        () => this.diagram.commit((d) => addNodeInView(d, node), 'add node'),
      );
    });
  }

  /** Sets one field on every selected node, as a single transaction. */
  protected editSelected(field: EditableField, value: string): Promise<void> {
    return this.setField(() => this.selectedNodes(), field, value);
  }

  /** Opens the color dialog for one node. */
  private showColorPicker(node: NodeData): void {
    this.colorTarget.set(node);
    this.colorDialog().nativeElement.showModal();
  }

  protected closeColorPicker(): void {
    this.colorDialog().nativeElement.close();
  }

  /** Gives the node of the color dialog its new color and closes the dialog. */
  protected pickColor(color: string): Promise<void> {
    const node = this.colorTarget();
    this.closeColorPicker();
    return this.setField(() => (node ? [node] : []), 'color', color);
  }

  /** Opens the comment dialog for one node. */
  private showComment(node: NodeData): void {
    this.commentTarget.set(node);
    this.commentDialog().nativeElement.showModal();
  }

  protected closeComment(): void {
    this.commentDialog().nativeElement.close();
  }

  /** Stores the comment of the node of the comment dialog; an empty text removes it. */
  protected saveComment(text: string): Promise<void> {
    const node = this.commentTarget();
    this.closeComment();
    return this.setField(() => (node ? [node] : []), 'comment', text.trim());
  }

  /** Sets `field` to `value` on the picked nodes that do not have it yet, as one transaction. */
  private setField(
    pick: () => NodeData[],
    field: EditableField | 'comment',
    value: string,
  ): Promise<void> {
    return this.measure(() => {
      const nodes = pick().filter((data) => data[field] !== value);
      return this.newTransactions(
        `Set ${field} on ${nodes.length} ${nodes.length === 1 ? 'node' : 'nodes'}`,
        once(() => nodes.length > 0),
        () =>
          this.model.commit((m) => {
            for (const data of nodes) m.set(data, field, value);
          }, `edit ${field}`),
      );
    });
  }

  /** Removes the relationships that are selected themselves. */
  protected removeSelectedLinks(): Promise<void> {
    return this.removeLinks(() => this.selectedLinkData());
  }

  /** Removes every relationship that starts or ends at one of the selected nodes. */
  protected removeLinksOfSelectedNodes(): Promise<void> {
    return this.removeLinks(() => this.linkDataOfSelectedNodes());
  }

  /** Opens the info dialog for one relationship. */
  private showLinkInfo(link: LinkData): void {
    this.linkInfo.set({
      link,
      from: this.model.findNodeDataForKey(link.from),
      to: this.model.findNodeDataForKey(link.to),
      // GoJS keeps its own bookkeeping on data objects under "__" names.
      json: JSON.stringify(link, (name, value) => (name.startsWith('__') ? undefined : value), 2),
    });
    this.linkDialog().nativeElement.showModal();
  }

  protected closeLinkInfo(): void {
    this.linkDialog().nativeElement.close();
  }

  /** Removes the relationship shown in the info dialog. */
  protected removeInfoLink(): Promise<void> {
    const link = this.linkInfo()?.link;
    this.closeLinkInfo();
    return this.removeLinks(() => (link ? [link] : []));
  }

  private removeLinks(pick: () => LinkData[]): Promise<void> {
    return this.measure(() => {
      const links = pick();
      return this.newTransactions(
        `Remove ${links.length} ${links.length === 1 ? 'relationship' : 'relationships'}`,
        once(() => links.length > 0),
        () =>
          this.model.commit(
            () => this.model.removeLinkDataCollection(links),
            'remove relationships',
          ),
      );
    });
  }

  /** Switches the layout as one transaction: the new node positions are part of the undo history. */
  protected changeLayout(type: LayoutType): Promise<void> {
    const label = LAYOUTS.find((layout) => layout.type === type)?.label ?? type;
    return this.measure(() => ({
      ...this.newTransactions(
        `Layout: ${label}`,
        once(() => type !== this.model.modelData.layoutType),
        () =>
          this.diagram.commit((d) => {
            d.model.set(d.model.modelData, 'layoutType', type);
            // GoJS records this assignment too, so undo/redo also swaps the layout object back.
            const layout = createLayout(type, d.nodes.count);
            resetPortSpots(d);
            d.layout = layout;
            // Layouts are not "ongoing", so ask for this one run explicitly.
            layout.isValidLayout = false;
          }, 'change layout'),
      ),
      showBusyFirst: true,
    }));
  }

  /**
   * Runs the current layout again as one transaction, which tidies the diagram
   * after nodes were dragged or relationships removed.
   */
  protected autoArrange(): Promise<void> {
    return this.measure(() => ({
      ...this.newTransactions(
        'Auto arrange',
        once(() => true),
        () => {
          this.diagram.commit((d) => {
            resetPortSpots(d);
            d.layoutDiagram(true);
          }, 'auto arrange');
          this.zoomToFitSoon();
        },
      ),
      showBusyFirst: true,
    }));
  }

  /** Switches the line type of every link as one transaction; the new routes are recorded too. */
  protected changeLinkType(type: LinkType): Promise<void> {
    return this.measure(() => ({
      ...this.newTransactions(
        `Lines: ${linkStyle(type).label}`,
        once(() => type !== this.model.modelData.linkType),
        () => this.model.commit((m) => m.set(m.modelData, 'linkType', type), 'change line type'),
      ),
      showBusyFirst: true,
    }));
  }

  protected zoomToFit(): void {
    this.clearHighlight();
    this.diagram.zoomToFit();
  }

  /** With exactly one node selected, highlights its tree; any other selection ends the highlight. */
  private highlightSelectedTree(): void {
    const selection = this.diagram.selection;
    const only = selection.count === 1 ? selection.first() : null;
    if (only instanceof go.Node) {
      highlightTree(this.diagram, only);
      this.highlighted = true;
    } else {
      this.clearHighlight();
    }
  }

  private clearHighlight(): void {
    if (!this.highlighted) return;
    this.highlighted = false;
    highlightTree(this.diagram, null);
  }

  /** Loads the dataset with this id from scratch, discarding the undo history. */
  protected reset(datasetId: string): void {
    this.loadModel(datasetId);
    this.datasetId.set(datasetId);
    this.log.set([]);
    this.refresh();
  }

  protected formatMs(value: number | null): string {
    if (value === null) return '–';
    return value < 10 ? value.toFixed(2) : value.toFixed(1);
  }

  // ----- internals -----

  /** Commits `runs` transactions, each giving the picked nodes new values for all custom fields. */
  private measureEdit(
    name: string,
    runs: number,
    pick: (all: NodeData[]) => NodeData[],
  ): Promise<void> {
    return this.measure(() => {
      const nodes = pick(this.model.nodeDataArray);
      let remaining = runs;
      return {
        ...this.newTransactions(
          name,
          () => remaining > 0,
          () => {
            remaining--;
            this.model.commit((m) => {
              for (const data of nodes) {
                const patch = randomPatch(data);
                for (const field of EDITABLE_FIELDS) m.set(data, field, patch[field]);
              }
            }, 'randomize');
          },
          runs,
        ),
        showBusyFirst: runs > 1,
      };
    });
  }

  /** An operation that commits `count` new transactions after the current history index. */
  private newTransactions(
    name: string,
    hasNext: () => boolean,
    step: () => void,
    count = 1,
  ): Operation {
    // The newest state is about to change, so its snapshot no longer applies.
    this.tipJson = null;
    // New transactions replace everything after the current history index.
    const first = this.undoManager.historyIndex + 1;
    return { name, hasNext, step, range: [first, first + count - 1] };
  }

  /** Loads a fresh model that keeps the currently selected layout and line type. */
  private loadModel(datasetId: string): void {
    const data = findDataset(datasetId).create();
    // Routing every link around the nodes takes about 10 s at 500 nodes and minutes
    // beyond that, so bigger diagrams start with straight lines.
    if (data.nodes.length > AVOID_NODES_LIMIT && avoidsNodes(this.linkType())) {
      this.linkType.set('straight');
    }
    const settings = { layoutType: this.layoutType(), linkType: this.linkType() };
    this.busy.set(true);
    this.initialJson = null;
    this.tipJson = null;
    // A new model gets new parts, none of them dimmed.
    this.highlighted = false;
    this.diagram.layout = createLayout(settings.layoutType, data.nodes.length);
    showModel(this.diagram, createModel(data, settings));
  }

  /** Makes the selects follow the model's settings, which a switch, an undo or a redo changes. */
  private syncSettings(): void {
    const { layoutType, linkType } = this.model.modelData;
    this.linkType.set(linkType);
    if (layoutType === this.layoutType()) return;
    this.layoutType.set(layoutType);
    this.zoomToFitSoon();
  }

  /** Fits the diagram once GoJS has recomputed its bounds, which it does in its next frame. */
  private zoomToFitSoon(): void {
    requestAnimationFrame(() => this.diagram.zoomToFit());
  }

  /**
   * Queues a timed operation. Operations run strictly one after another, and each
   * is planned only when its turn comes, so one requested while another is still
   * waiting for its frame is neither lost nor based on a stale history index.
   */
  private measure(plan: () => Operation): Promise<void> {
    const run = this.queue.then(() => this.runOperation(plan));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async runOperation(plan: () => Operation): Promise<void> {
    // Busy at this point means a model is still loading.
    if (this.busy()) return;
    this.clearHighlight();
    const { name, hasNext, step, range, showBusyFirst } = plan();
    this.busy.set(true);
    try {
      // Long runs block the main thread, so let the disabled buttons paint first.
      if (showBusyFirst) await afterNextPaint();

      this.measuring = true;
      const start = performance.now();
      const result = timeSteps(hasNext, step);
      this.measuring = false;
      const paintedAt = await afterNextPaint();

      if (result.steps > 0) {
        const entry: LogEntry = {
          id: this.nextLogId++,
          op: name,
          steps: result.steps,
          changes: this.countChanges(...range),
          totalMs: result.totalMs,
          avgMs: result.totalMs / result.steps,
          minMs: result.minMs,
          maxMs: result.maxMs,
          paintMs: paintedAt === null ? null : paintedAt - start,
        };
        this.log.update((entries) => [entry, ...entries].slice(0, MAX_LOG_ENTRIES));
      }
    } finally {
      this.measuring = false;
      this.refresh();
      this.busy.set(false);
    }
  }

  /** Remembers the newest state before the first undo away from it, so "redo all" can be verified. */
  private captureTip(): void {
    const um = this.undoManager;
    if (this.tipJson === null && um.canUndo() && !um.canRedo()) this.tipJson = this.model.toJson();
  }

  /** Number of ChangedEvents recorded in history[from..to]. */
  private countChanges(from: number, to: number): number {
    const history = this.undoManager.history;
    let total = 0;
    const last = Math.min(to, history.count - 1);
    for (let i = Math.max(from, 0); i <= last; i++) total += history.elt(i).changes.count;
    return total;
  }

  private refresh(): void {
    const um = this.undoManager;
    const memory = (performance as { memory?: { usedJSHeapSize: number } }).memory;
    this.stats.set({
      nodes: this.model.nodeDataArray.length,
      links: this.model.linkDataArray.length,
      historyLength: um.history.count,
      historyIndex: um.historyIndex,
      changedEvents: this.countChanges(0, um.history.count - 1),
      canUndo: um.canUndo(),
      canRedo: um.canRedo(),
      heapMb: memory ? memory.usedJSHeapSize / 1048576 : null,
    });
    // The limit follows the node count, so a number typed for a bigger diagram may now be too high.
    if (this.bulkRuns() > this.maxBulkRuns()) this.bulkRuns.set(this.maxBulkRuns());
    this.stateCheck.set(this.describeState());
    this.syncSettings();
    this.syncSelection();
  }

  private describeState(): StateCheck {
    const um = this.undoManager;
    if (this.initialJson === null) return { label: 'Waiting for the initial layout', ok: null };
    if (um.historyIndex < 0) {
      return this.model.toJson() === this.initialJson
        ? { label: 'Initial state: matches the startup snapshot', ok: true }
        : { label: 'Initial state: differs from the startup snapshot', ok: false };
    }
    if (um.canRedo()) {
      return { label: `Transaction ${um.historyIndex + 1} of ${um.history.count}`, ok: null };
    }
    if (this.tipJson === null) return { label: 'Latest state', ok: null };
    return this.model.toJson() === this.tipJson
      ? { label: 'Latest state: matches the snapshot taken before undo', ok: true }
      : { label: 'Latest state: differs from the snapshot taken before undo', ok: false };
  }

  private selectedNodes(): NodeData[] {
    const nodes: NodeData[] = [];
    this.diagram.selection.each((part) => {
      if (part instanceof go.Node && part.data) nodes.push(part.data as NodeData);
    });
    return nodes;
  }

  private selectedLinkData(): LinkData[] {
    const links: LinkData[] = [];
    this.diagram.selection.each((part) => {
      if (part instanceof go.Link && part.data) links.push(part.data as LinkData);
    });
    return links;
  }

  private linkDataOfSelectedNodes(): LinkData[] {
    const links = new Set<LinkData>();
    this.diagram.selection.each((part) => {
      if (!(part instanceof go.Node)) return;
      part.findLinksConnected().each((link) => {
        if (link.data) links.add(link.data as LinkData);
      });
    });
    return [...links];
  }

  private syncSelection(): void {
    this.selectedLinks.set(this.selectedLinkData().length);
    this.linksOfSelectedNodes.set(this.linkDataOfSelectedNodes().length);
    const nodes = this.selectedNodes();
    const shared = <F extends EditableField>(field: F): NodeData[F] | null =>
      nodes.every((data) => data[field] === nodes[0][field]) ? nodes[0][field] : null;
    this.selected.set(
      nodes.length === 0
        ? null
        : {
            count: nodes.length,
            title: shared('title'),
            subtitle: shared('subtitle'),
            shape: shared('shape'),
            color: shared('color'),
          },
    );
  }
}

/** Opens `url` the way a link with target="_blank" does: in a new tab, never a popup window. */
function openInNewTab(url: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener';
  link.click();
}

/** Wraps a condition so that it is true for at most one step. */
function once(condition: () => boolean): () => boolean {
  let used = false;
  return () => {
    if (used) return false;
    used = true;
    return condition();
  };
}
