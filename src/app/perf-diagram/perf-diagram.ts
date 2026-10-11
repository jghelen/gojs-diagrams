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
  createOverview,
  deleteIconCentre,
  highlightTree,
  picturedParts,
  revealNodesOneByOne,
  showSearchHit,
  textColorFor,
} from '../diagram/diagram-factory';
import { ChangeDetails, describeChanges } from '../diagram/change-details';
import { downloadFileName } from '../diagram/file-name';
import { HistoryService, StateCheck, withoutUndo } from '../diagram/history.service';
import { DATASETS, findDataset } from '../diagram/datasets';
import { LAYOUTS, LayoutType, createLayout, resetPortSpots } from '../diagram/layouts';
import { SHAPE_TILES } from '../diagram/shape-tiles';
import { newBatchUrl } from '../new-batch/new-batch';
import {
  LINK_TYPES,
  LinkType,
  avoidsNodes,
  linkStyle,
  tooBigToAvoidNodes,
} from '../diagram/link-types';
import {
  EDITABLE_FIELDS,
  EditableField,
  LinkData,
  NodeData,
  formatOwnership,
  randomPatch,
} from '../diagram/node-data';
import {
  BLANK_DATASET,
  BULK_EDIT_BUDGET,
  COLORS,
  DEFAULT_COLOR,
  DEFAULT_DATASET,
  DEFAULT_LAYOUT,
  DEFAULT_LINK_TYPE,
  DEFAULT_SHAPE,
  FAILURE_NOTICE,
  FUND_TYPES,
  IMAGE_MAX_SIDE,
  IMAGE_SCALE,
  LOG_OPEN_KEY,
  MAX_CHANGE_ROWS,
  MAX_LOG_ENTRIES,
} from '../diagram/constants';

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
  /** What those changes were, for the dialog behind the number. */
  details: ChangeDetails;
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  /** From the start of the operation until the result was painted; null if the tab was hidden. */
  paintMs: number | null;
}

/** The selected nodes: per field, the value they all share, or null where they differ. */
type Selection = { count: number } & { [F in EditableField]: NodeData[F] | null };

interface LinkInfo {
  link: LinkData;
  from: NodeData | null;
  to: NodeData | null;
  /** The ownership percentage as text, or null when there is no data. */
  ownership: string | null;
  /** The link's data object as stored in the model. */
  json: string;
}

/** What the styles dialog will apply; null means "leave as it is". */
interface StyleDraft {
  color: string | null;
  shape: go.FigureName | null;
}

/** The nodes of one fund type, as listed in the styles dialog. */
interface StyleRow {
  type: string;
  count: number;
  /** The color and the shape they all share, or null where they differ. */
  color: string | null;
  shape: go.FigureName | null;
}

interface DeleteRequest {
  /** Keys of the nodes to delete. */
  keys: number[];
  /** Relationships that were selected along with them and are removed too. */
  links: LinkData[];
  /** Title of the node when there is exactly one. */
  title: string | null;
  /** How many relationships touch the nodes and are removed with them. */
  attached: number;
}

/**
 * Something the user asked for, cut into the steps whose time is measured: one
 * step is one transaction that is recorded, undone or redone.
 */
interface Operation {
  /** Shown in the timing log. */
  name: string;
  /** Whether there is another step to do. */
  hasNext: () => boolean;
  step: () => void;
  /** Lets the page show its disabled buttons before a long operation blocks it. */
  showBusyFirst?: boolean;
}

/** A yes/no setting remembered by the browser; `fallback` when there is none or storage is blocked. */
function readFlag(key: string, fallback: boolean): boolean {
  try {
    const stored = localStorage.getItem(key);
    return stored === null ? fallback : stored === 'true';
  } catch {
    return fallback;
  }
}

function writeFlag(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Not remembered, then; the setting still works until the page is closed.
  }
}

@Component({
  selector: 'app-perf-diagram',
  templateUrl: './perf-diagram.html',
  styleUrl: './perf-diagram.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // One history per diagram, so the service lives and dies with this component.
  providers: [HistoryService],
})
export class PerfDiagram {
  protected readonly angularVersion = VERSION.full;
  protected readonly gojsVersion = go.Diagram.version;
  protected readonly datasets = DATASETS;
  protected readonly layouts = LAYOUTS;
  protected readonly linkTypes = LINK_TYPES;
  protected readonly shapeTiles = SHAPE_TILES;
  protected readonly colors = COLORS;

  /** Id of the dataset the diagram was loaded with. */
  protected readonly datasetId = signal(DEFAULT_DATASET);
  protected readonly layoutType = signal<LayoutType>(DEFAULT_LAYOUT);
  protected readonly linkType = signal<LinkType>(DEFAULT_LINK_TYPE);
  /** True when the diagram has no nodes; zooming and arranging make no sense then. */
  protected readonly isEmpty = computed(() => (this.stats()?.nodes ?? 0) === 0);
  /** What is typed into the search box, and the keys of the nodes whose name contains it. */
  protected readonly searchQuery = signal('');
  protected readonly searchMatches = signal<number[]>([]);
  /** Which of the matches is being looked at; -1 before the first step. */
  protected readonly searchIndex = signal(-1);
  protected readonly searchSummary = computed(() => {
    const found = this.searchMatches().length;
    if (this.searchQuery().trim() === '') return '';
    if (found === 0) return 'No nodes found';
    return this.searchIndex() < 0 ? `${found} found` : `${this.searchIndex() + 1} of ${found}`;
  });
  /** The diagram's name and description, as shown in the bar above the canvas. */
  protected readonly diagramName = signal('');
  protected readonly diagramDescription = signal('');
  /** The layout in use, with its name and icon, for the tool strip. */
  protected readonly currentLayout = computed(
    () => LAYOUTS.find((layout) => layout.type === this.layoutType()) ?? LAYOUTS[0],
  );
  /** Whether the tool strip is showing its column of layout icons. */
  protected readonly layoutMenuOpen = signal(false);
  /** The line type in use, with its name and icon, for the tool strip. */
  protected readonly currentLinkStyle = computed(() => linkStyle(this.linkType()));
  /** Whether the tool strip is showing its column of line type icons. */
  protected readonly linkMenuOpen = signal(false);
  /** Whether the tool strip shows its column of shape icons, for the selected nodes. */
  protected readonly shapeMenuOpen = signal(false);
  /** The picture of the shape that all selected nodes have; null when they differ or none is selected. */
  protected readonly selectedShapeTile = computed(() => {
    const shape = this.selected()?.shape;
    return SHAPE_TILES.find((tile) => tile.figure === shape) ?? null;
  });
  /** The hover text of the shape tool: what the selection has, or what to do first. */
  protected readonly shapeTip = computed(() => {
    const sel = this.selected();
    if (!sel) return 'Shape: select nodes first';
    return `Shape: ${this.selectedShapeTile()?.label ?? 'mixed'}`;
  });
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
  /** What to tell the user after an action failed; null when the last action went well. */
  protected readonly failure = signal<string | null>(null);
  /** Whether the table of timings below the canvas is shown; closing it gives the canvas its room. */
  protected readonly logOpen = signal(readFlag(LOG_OPEN_KEY, true));

  /** A picture of the diagram while it is being printed. */
  protected readonly printImage = signal<string | null>(null);
  /** What the delete confirmation dialog is asking about. */
  protected readonly deleteRequest = signal<DeleteRequest | null>(null);
  /** One row per fund type in the diagram, for the styles dialog. */
  protected readonly styleRows = signal<StyleRow[]>([]);
  /** The fund types ticked in the styles dialog. */
  protected readonly styleTypes = signal<ReadonlySet<string>>(new Set());
  /** The color and shape picked there but not applied yet; null leaves that one as it is. */
  protected readonly styleDraft = signal<StyleDraft>({ color: null, shape: null });
  protected readonly allStyleTypesSelected = computed(
    () => this.styleRows().length > 0 && this.styleTypes().size === this.styleRows().length,
  );
  /** How many nodes the ticked fund types cover. */
  protected readonly styleNodeCount = computed(() =>
    this.styleRows()
      .filter((row) => this.styleTypes().has(row.type))
      .reduce((sum, row) => sum + row.count, 0),
  );
  /**
   * What a node will look like after Apply: the picked color and shape, and for
   * whatever was not picked, what the first ticked fund type has now.
   */
  protected readonly nodePreview = computed(() => {
    const ticked = this.styleRows().filter((row) => this.styleTypes().has(row.type));
    const draft = this.styleDraft();
    const shape = draft.shape ?? ticked[0]?.shape ?? DEFAULT_SHAPE;
    const color = draft.color ?? ticked[0]?.color ?? DEFAULT_COLOR;
    const tile = SHAPE_TILES.find((candidate) => candidate.figure === shape) ?? SHAPE_TILES[0];
    return {
      path: tile.path,
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
  /** Apply needs at least one fund type and at least a color or a shape. */
  protected readonly canApplyStyle = computed(() => {
    const draft = this.styleDraft();
    return this.styleNodeCount() > 0 && (draft.color !== null || draft.shape !== null);
  });
  /** What is currently typed into the comment dialog; Save needs it to hold some text. */
  protected readonly commentDraft = signal('');
  /** The node whose comment is being edited in the comment dialog. */
  protected readonly commentTarget = signal<NodeData | null>(null);
  /** The node whose color is being chosen in the color dialog. */
  protected readonly colorTarget = signal<NodeData | null>(null);
  /** The relationship shown in the info dialog. */
  protected readonly linkInfo = signal<LinkInfo | null>(null);

  private readonly host = viewChild.required<ElementRef<HTMLDivElement>>('diagramHost');
  private readonly overviewHost = viewChild.required<ElementRef<HTMLDivElement>>('overviewHost');
  private readonly linkDialog = viewChild.required<ElementRef<HTMLDialogElement>>('linkDialog');
  /** The operation whose changes are listed in the changes dialog. */
  protected readonly changesShown = signal<LogEntry | null>(null);
  protected readonly maxChangeRows = MAX_CHANGE_ROWS;
  private readonly changesDialog =
    viewChild.required<ElementRef<HTMLDialogElement>>('changesDialog');
  private readonly colorDialog = viewChild.required<ElementRef<HTMLDialogElement>>('colorDialog');
  private readonly commentDialog =
    viewChild.required<ElementRef<HTMLDialogElement>>('commentDialog');
  private readonly deleteDialog = viewChild.required<ElementRef<HTMLDialogElement>>('deleteDialog');
  private readonly stylesDialog = viewChild.required<ElementRef<HTMLDialogElement>>('stylesDialog');
  private readonly resetDialog = viewChild.required<ElementRef<HTMLDialogElement>>('resetDialog');
  private diagram!: go.Diagram;
  /** The small picture of the whole diagram in the corner of the canvas. */
  private overview!: go.Overview;
  /** The undo history of the diagram: recording changes, undo, redo and everything read from it. */
  private readonly history = inject(HistoryService);
  /** True while a timed operation runs, so that refreshing the page adds nothing to the measurement. */
  private measuring = false;
  private nextLogId = 1;
  /** Stops the animation in which a loaded diagram's nodes appear one by one. */
  private stopReveal: () => void = () => undefined;
  private stopWatchingErrors: () => void = () => undefined;
  /** True while a node's tree is highlighted and the rest of the diagram dimmed. */
  private highlighted = false;
  private queue: Promise<void> = Promise.resolve();

  constructor() {
    afterNextRender(() => this.init());
    inject(DestroyRef).onDestroy(() => {
      this.stopReveal();
      this.stopWatchingErrors();
      if (this.overview) this.overview.div = null;
      if (this.diagram) this.diagram.div = null;
    });
  }

  private get model(): NodeModel {
    return this.diagram.model as NodeModel;
  }

  private init(): void {
    this.diagram = createDiagram(this.host().nativeElement, {
      onLinkInfo: (link) => this.showLinkInfo(link),
      onNodeColor: (node) => this.showColorPicker(node),
      onNodeComment: (node) => this.showComment(node),
      // A new tab, so the diagram and its undo history stay as they are.
      onNodeBatch: (node) => openInNewTab(newBatchUrl(node.key)),
      onNodeDelete: (node) => this.askToDelete([node]),
    });
    this.overview = createOverview(this.overviewHost().nativeElement, this.diagram);

    // The page shows numbers from the history, so it follows every change of it, also
    // the ones GoJS makes itself (dragging a node, editing a text in place).
    this.history.connect(this.diagram, () => {
      if (!this.measuring) this.refresh();
    });
    // Ctrl/Cmd+Z and Ctrl/Cmd+Y do what the Undo and Redo buttons do, timing included.
    this.history.sendShortcutsTo(
      () => void this.undo(),
      () => void this.redo(),
    );
    // Same for the Delete key, which removes whatever is selected.
    this.diagram.commandHandler.deleteSelection = () => void this.deleteSelection();

    // The initial layout writes every node's `loc`, so the snapshot is taken after it.
    this.diagram.addDiagramListener('InitialLayoutCompleted', () => {
      this.history.markInitialState();
      // GoJS clears the history right after this event; read the numbers once it has.
      queueMicrotask(() => this.refresh());
      // The nodes now appear one by one; everything stays disabled until they are all there.
      this.overview.isEnabled = false;
      this.stopReveal = revealNodesOneByOne(this.diagram, () => {
        this.overview.isEnabled = true;
        this.busy.set(false);
      });
    });
    this.diagram.addDiagramListener('ChangedSelection', () => {
      this.syncSelection();
      this.highlightSelectedTree();
      // Selecting something else takes the attention away from the search result.
      if (this.diagram.selection.count > 0) this.leaveSearchHit();
    });
    // Zooming by wheel or pinch counts as an action that ends the highlight.
    this.diagram.addDiagramListener('ViewportBoundsChanged', (e) => {
      if (e.subject.scale !== this.diagram.scale) this.clearHighlight();
    });

    // Errors inside GoJS's own mouse and keyboard handling arrive here, not in runOperation.
    const onError = (): void => {
      // A drag or a text edit that is under way keeps its transaction, whatever went wrong elsewhere.
      if (this.diagram.currentTool !== this.diagram.defaultTool) return;
      if (this.measuring || !this.history.hasUnfinishedTransaction) return;
      this.recoverFrom('An error left a transaction open.');
      this.refresh();
    };
    window.addEventListener('error', onError);
    this.stopWatchingErrors = () => window.removeEventListener('error', onError);

    this.loadModel(this.datasetId());
    this.refresh();
  }

  // ----- history -----

  protected undo(): Promise<void> {
    return this.measure(() => {
      // Saved before the clock starts: redoing everything is later checked against it.
      this.history.rememberLatestState();
      return {
        name: 'Undo',
        hasNext: once(() => this.history.canUndo),
        step: () => this.history.undo(),
      };
    });
  }

  protected redo(): Promise<void> {
    return this.measure(() => ({
      name: 'Redo',
      hasNext: once(() => this.history.canRedo),
      step: () => this.history.redo(),
    }));
  }

  /** Undoes one transaction after another until the diagram is as it was loaded. */
  protected undoAll(): Promise<void> {
    return this.measure(() => {
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
  protected redoAll(): Promise<void> {
    return this.measure(() => ({
      name: 'Redo all',
      hasNext: () => this.history.canRedo,
      step: () => this.history.redo(),
      showBusyFirst: true,
    }));
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
        subtitle: FUND_TYPES[0],
        shape: DEFAULT_SHAPE,
        color: DEFAULT_COLOR,
        comment: '',
      };
      return this.newTransactions(
        'Add node',
        once(() => true),
        () => this.history.record('add node', () => addNodeInView(this.diagram, node)),
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

  /** Opens the dialog in which color and shape are set per fund type. */
  protected openStyles(): void {
    this.refreshStyles();
    this.styleDraft.set({ color: null, shape: null });
    this.stylesDialog().nativeElement.showModal();
  }

  protected closeStyles(): void {
    this.stylesDialog().nativeElement.close();
  }

  /**
   * How a fund type's nodes look, for the small preview in its row. For a ticked
   * type this already includes the color and shape picked but not yet applied.
   */
  protected stylePreview(row: StyleRow): { path: string; fill: string; mixed: boolean } {
    const draft = this.styleTypes().has(row.type) ? this.styleDraft() : null;
    const shape = draft?.shape ?? row.shape;
    const color = draft?.color ?? row.color;
    const tile = SHAPE_TILES.find((candidate) => candidate.figure === shape) ?? SHAPE_TILES[0];
    return { path: tile.path, fill: color ?? '#ffffff', mixed: shape === null || color === null };
  }

  /** Ticks or unticks one fund type in the styles dialog. */
  protected toggleStyleType(type: string): void {
    const types = new Set(this.styleTypes());
    if (!types.delete(type)) types.add(type);
    this.styleTypes.set(types);
  }

  /** Ticks every fund type, or none. */
  protected selectAllStyleTypes(all: boolean): void {
    this.styleTypes.set(new Set(all ? this.styleRows().map((row) => row.type) : []));
  }

  /** Picks a color or shape for Apply; picking the same one again takes the choice back. */
  protected chooseStyle<F extends keyof StyleDraft>(field: F, value: StyleDraft[F]): void {
    this.styleDraft.update((draft) => ({
      ...draft,
      [field]: draft[field] === value ? null : value,
    }));
  }

  /**
   * Gives every node of the ticked fund types the picked color and shape, as one
   * transaction, and closes the dialog. Nothing in the diagram changes before
   * this is called.
   */
  protected applyStyles(): Promise<void> {
    const types = this.styleTypes();
    const { color, shape } = this.styleDraft();
    this.closeStyles();
    return this.measure(() => {
      const nodes = this.model.nodeDataArray.filter(
        (node) =>
          types.has(node.subtitle) &&
          ((color !== null && node.color !== color) || (shape !== null && node.shape !== shape)),
      );
      return this.newTransactions(
        `Style ${nodes.length} ${nodes.length === 1 ? 'node' : 'nodes'}`,
        once(() => nodes.length > 0),
        () => {
          this.history.record('apply styles', () => {
            for (const node of nodes) {
              if (color !== null) this.model.set(node, 'color', color);
              if (shape !== null) this.model.set(node, 'shape', shape);
            }
          });
          this.styleDraft.set({ color: null, shape: null });
        },
      );
    });
  }

  /** Asks before resetting every node's style. */
  protected askToResetStyles(): void {
    this.resetDialog().nativeElement.showModal();
  }

  protected cancelResetStyles(): void {
    this.resetDialog().nativeElement.close();
  }

  /** Resets every node's style and closes both dialogs, so the styles dialog starts afresh next time. */
  protected confirmResetStyles(): Promise<void> {
    this.cancelResetStyles();
    this.closeStyles();
    this.styleTypes.set(new Set());
    this.styleDraft.set({ color: null, shape: null });
    return this.resetStyles();
  }

  /** Turns every node back into a gray rectangle, as one transaction. */
  private resetStyles(): Promise<void> {
    return this.measure(() => {
      const nodes = this.model.nodeDataArray.filter(
        (node) => node.shape !== DEFAULT_SHAPE || node.color !== DEFAULT_COLOR,
      );
      return this.newTransactions(
        'Reset styles',
        once(() => nodes.length > 0),
        () =>
          this.history.record('reset styles', () => {
            for (const node of nodes) {
              this.model.set(node, 'shape', DEFAULT_SHAPE);
              this.model.set(node, 'color', DEFAULT_COLOR);
            }
          }),
      );
    });
  }

  /** Groups the nodes by fund type (their subtitle) for the styles dialog. */
  private refreshStyles(): void {
    const rows = new Map<string, StyleRow>();
    for (const node of this.model.nodeDataArray) {
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
    this.styleRows.set([...rows.values()].sort((a, b) => a.type.localeCompare(b.type)));
    // A type that no node has any more cannot stay ticked.
    const ticked = [...this.styleTypes()].filter((type) => rows.has(type));
    if (ticked.length !== this.styleTypes().size) this.styleTypes.set(new Set(ticked));
  }

  /** Opens the comment dialog for one node. */
  private showComment(node: NodeData): void {
    this.commentDraft.set(node.comment);
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
          this.history.record(`edit ${field}`, () => {
            for (const data of nodes) this.model.set(data, field, value);
          }),
      );
    });
  }

  /**
   * What the Delete key does: asks before deleting when nodes are selected, and
   * removes selected relationships straight away when only those are selected.
   */
  protected deleteSelection(): Promise<void> | void {
    const nodes = this.selectedNodes();
    if (nodes.length > 0) return this.askToDelete(nodes, this.selectedLinkData());
    return this.removeSelectedLinks();
  }

  /** Asks before deleting the selected nodes. */
  protected deleteSelectedNodes(): void {
    this.askToDelete(this.selectedNodes());
  }

  /** Opens the confirmation dialog for deleting these nodes, and these relationships with them. */
  private askToDelete(nodes: NodeData[], links: LinkData[] = []): void {
    if (nodes.length === 0) return;
    const keys = new Set(nodes.map((node) => node.key));
    const attached = this.model.linkDataArray.filter(
      (link) => (keys.has(link.from) || keys.has(link.to)) && !links.includes(link),
    );
    this.deleteRequest.set({
      keys: [...keys],
      links,
      title: nodes.length === 1 ? nodes[0].title : null,
      attached: attached.length,
    });
    this.deleteDialog().nativeElement.showModal();
  }

  protected cancelDelete(): void {
    this.deleteDialog().nativeElement.close();
  }

  /**
   * Deletes what the confirmation dialog asked about, as one transaction: the
   * nodes, and every relationship that starts or ends at one of them. All other
   * nodes stay, and no relationship is created or re-attached.
   */
  protected confirmDelete(): Promise<void> {
    const request = this.deleteRequest();
    this.cancelDelete();
    return this.measure(() => {
      // Looked up again now, in case something changed while the dialog was open.
      const nodes = (request?.keys ?? [])
        .map((key) => this.model.findNodeDataForKey(key))
        .filter((node) => node !== null);
      const keys = new Set(nodes.map((node) => node.key));
      const selected = request?.links ?? [];
      const links = this.model.linkDataArray.filter(
        (link) => keys.has(link.from) || keys.has(link.to) || selected.includes(link),
      );
      return this.newTransactions(
        `Delete ${nodes.length} ${nodes.length === 1 ? 'node' : 'nodes'}`,
        once(() => nodes.length > 0),
        () =>
          this.history.record('delete', () => {
            this.model.removeLinkDataCollection(links);
            this.model.removeNodeDataCollection(nodes);
          }),
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
      ownership: link.ownership === undefined ? null : formatOwnership(link.ownership),
      // GoJS keeps its own bookkeeping on data objects under "__" names.
      json: JSON.stringify(link, (name, value) => (name.startsWith('__') ? undefined : value), 2),
    });
    this.linkDialog().nativeElement.showModal();
  }

  /** Opens the list of what an operation in the statistics changed. */
  protected showChanges(entry: LogEntry): void {
    this.changesShown.set(entry);
    this.changesDialog().nativeElement.showModal();
  }

  protected closeChanges(): void {
    this.changesDialog().nativeElement.close();
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
          this.history.record('remove relationships', () =>
            this.model.removeLinkDataCollection(links),
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
          this.history.record('change layout', () => {
            const d = this.diagram;
            d.model.set(d.model.modelData, 'layoutType', type);
            // GoJS records this assignment too, so undo/redo also swaps the layout object back.
            const layout = createLayout(type, d.nodes.count);
            resetPortSpots(d);
            d.layout = layout;
            // Layouts are not "ongoing", so ask for this one run explicitly.
            layout.isValidLayout = false;
          }),
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
          this.history.record('auto arrange', () => {
            resetPortSpots(this.diagram);
            this.diagram.layoutDiagram(true);
          });
          this.zoomToFitSoon();
        },
      ),
      showBusyFirst: true,
    }));
  }

  /** Opens or closes one of the tool strip's two columns of icons; only one is open at a time. */
  protected toggleMenu(menu: 'layout' | 'lines' | 'shape'): void {
    const layout = menu === 'layout' && !this.layoutMenuOpen();
    const lines = menu === 'lines' && !this.linkMenuOpen();
    const shape = menu === 'shape' && !this.shapeMenuOpen();
    this.layoutMenuOpen.set(layout);
    this.linkMenuOpen.set(lines);
    this.shapeMenuOpen.set(shape);
  }

  /** Gives the selected nodes the shape picked from the tool strip's column of icons, which then closes. */
  protected pickShape(shape: string): Promise<void> {
    this.shapeMenuOpen.set(false);
    return this.editSelected('shape', shape);
  }

  /**
   * The name of a line type as the tool strip shows it on hover. On a big diagram
   * the orthogonal types are not routed around the nodes, and their names say so.
   */
  protected linkTypeLabel(type: LinkType): string {
    const label = linkStyle(type).label;
    return avoidsNodes(type) && tooBigToAvoidNodes(this.stats()?.nodes ?? 0)
      ? `${label} (crosses nodes on a diagram this big)`
      : label;
  }

  /** Picks a line type from the tool strip's column of icons, which then closes. */
  protected pickLinkType(type: LinkType): Promise<void> {
    this.linkMenuOpen.set(false);
    return this.changeLinkType(type);
  }

  /** Picks a layout from the tool strip's column of icons, which then closes. */
  protected pickLayout(type: LayoutType): Promise<void> {
    this.layoutMenuOpen.set(false);
    return this.changeLayout(type);
  }

  /** Switches the line type of every link as one transaction; the new routes are recorded too. */
  protected changeLinkType(type: LinkType): Promise<void> {
    return this.measure(() => ({
      ...this.newTransactions(
        `Lines: ${linkStyle(type).label}`,
        once(() => type !== this.model.modelData.linkType),
        () =>
          this.history.record('change line type', () =>
            this.model.set(this.model.modelData, 'linkType', type),
          ),
      ),
      showBusyFirst: true,
    }));
  }

  /** Opens or closes the benchmark statistics below the canvas, and remembers the choice. */
  protected toggleLog(): void {
    this.logOpen.update((open) => !open);
    writeFlag(LOG_OPEN_KEY, this.logOpen());
    // The canvas grows or shrinks with it; GoJS has to be told once the page is laid out again.
    requestAnimationFrame(() => this.diagram.requestUpdate());
  }

  /** Carries out what was picked in the Actions dropdown and puts the dropdown back. */
  protected runAction(menu: HTMLSelectElement): void {
    const action = menu.value;
    menu.value = '';
    if (action === 'export-png') this.exportPng();
    if (action === 'print') this.print();
  }

  /** Downloads a picture of the whole diagram as a PNG file named after the diagram. */
  protected exportPng(): void {
    this.diagram.makeImageData({
      ...this.imageOptions(),
      returnType: 'blob',
      callback: (blob: Blob) => {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = downloadFileName(this.model.modelData.name, 'png');
        link.click();
        URL.revokeObjectURL(link.href);
      },
    });
  }

  /**
   * Prints the whole diagram. A picture of it is put on the page, where the
   * print style sheet shows it instead of the app; printing starts once the
   * picture has loaded.
   */
  protected print(): void {
    this.printImage.set(this.diagram.makeImageData(this.imageOptions()) as string);
  }

  /**
   * How the diagram is turned into a picture: all of it, not just what is on
   * screen, on white, sharp, and as it is, without the gold outlines of the
   * selection and without the dimming of the tree highlight.
   */
  private imageOptions(): go.ImageRendererOptions {
    this.clearHighlight();
    const bounds = this.diagram.documentBounds;
    const longest = Math.max(bounds.width, bounds.height, 1);
    return {
      background: '#ffffff',
      parts: picturedParts(this.diagram),
      // The info icons and percentages live in a temporary layer.
      showTemporary: true,
      scale: Math.min(IMAGE_SCALE, IMAGE_MAX_SIDE / longest),
      maxSize: new go.Size(IMAGE_MAX_SIDE + 100, IMAGE_MAX_SIDE + 100),
    };
  }

  protected printLoaded(): void {
    window.print();
    this.printImage.set(null);
  }

  protected zoomIn(): void {
    this.diagram.commandHandler.increaseZoom();
  }

  protected zoomOut(): void {
    this.diagram.commandHandler.decreaseZoom();
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

  /** Looks for the nodes whose name contains what was typed; no result is stepped to yet. */
  protected search(query: string): void {
    this.searchQuery.set(query);
    this.searchIndex.set(-1);
    showSearchHit(this.diagram, null);
    this.updateSearch();
  }

  /** Goes to the next or previous search result: marks that node, centres on it and zooms in. */
  protected searchStep(delta: 1 | -1): void {
    const matches = this.searchMatches();
    if (matches.length === 0) return;
    const current = this.searchIndex();
    const next =
      current < 0
        ? delta > 0
          ? 0
          : matches.length - 1
        : (current + delta + matches.length) % matches.length;
    this.searchIndex.set(next);
    showSearchHit(this.diagram, this.diagram.findNodeForKey(matches[next]));
  }

  /** Stops looking at a particular search result; the matches and their count stay. */
  private leaveSearchHit(): void {
    if (this.searchIndex() < 0) return;
    this.searchIndex.set(-1);
    showSearchHit(this.diagram, null);
  }

  /**
   * Works out the matches again. Called after every change to the diagram, since
   * renaming, adding, deleting and undo all alter which nodes match.
   */
  private updateSearch(): void {
    const query = this.searchQuery().trim().toLowerCase();
    const lookingAt = this.searchMatches()[this.searchIndex()];
    const matches = query
      ? this.model.nodeDataArray
          .filter((node) => node.title.toLowerCase().includes(query))
          .map((node) => node.key)
      : [];
    this.searchMatches.set(matches);
    // Stay on the result that was being looked at, if it still matches.
    const index = lookingAt === undefined ? -1 : matches.indexOf(lookingAt);
    this.searchIndex.set(index);
    // The node that was being looked at no longer matches, or is gone.
    if (lookingAt !== undefined && index < 0) showSearchHit(this.diagram, null);
  }

  /** Takes over the name or description typed above the canvas, as one transaction. */
  protected setDiagramInfo(field: 'name' | 'description', input: HTMLInputElement): Promise<void> {
    const value = input.value.trim();
    input.value = value;
    return this.measure(() =>
      this.newTransactions(
        field === 'name' ? 'Rename diagram' : 'Describe diagram',
        once(() => value !== this.model.modelData[field]),
        () =>
          this.history.record(`edit ${field}`, () =>
            this.model.set(this.model.modelData, field, value),
          ),
      ),
    );
  }

  /** Starts a diagram from scratch: an empty canvas to add nodes and relationships to. */
  protected newDiagram(): void {
    this.reset(BLANK_DATASET);
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
            this.history.record('randomize', () => {
              for (const data of nodes) {
                const patch = randomPatch(data);
                for (const field of EDITABLE_FIELDS) this.model.set(data, field, patch[field]);
              }
            });
          },
        ),
        showBusyFirst: runs > 1,
      };
    });
  }

  /** An operation whose every step records one new transaction. */
  private newTransactions(name: string, hasNext: () => boolean, step: () => void): Operation {
    return { name, hasNext, step };
  }

  /** Loads a fresh model that keeps the currently selected layout and line type. */
  private loadModel(datasetId: string): void {
    // A reveal of the previous diagram that is still running has nothing left to show.
    this.stopReveal();
    // Not a change for the history: see revealNodesOneByOne.
    withoutUndo(this.diagram, () => (this.diagram.isEnabled = true));
    // GoJS refuses to replace a model in the middle of a transaction, whether a
    // tool is using it or an error left it open.
    this.diagram.currentTool.doCancel();
    this.history.rollBackUnfinished();
    this.failure.set(null);
    const dataset = findDataset(datasetId);
    const data = dataset.create();
    // A big diagram's lines are not routed around its nodes, and orthogonal lines
    // that run across nodes are hard to follow, so it starts with straight ones.
    if (tooBigToAvoidNodes(data.nodes.length) && avoidsNodes(this.linkType())) {
      this.linkType.set('straight');
    }
    const settings = {
      layoutType: this.layoutType(),
      linkType: this.linkType(),
      // A loaded diagram starts out named after its data; the user can rename it.
      name: datasetId === BLANK_DATASET ? 'Untitled diagram' : dataset.label,
      description: '',
    };
    this.busy.set(true);
    // A new model gets new parts, none of them dimmed.
    this.highlighted = false;
    // What was searched for belonged to the diagram that is replaced now.
    this.searchQuery.set('');
    this.searchMatches.set([]);
    this.searchIndex.set(-1);
    this.diagram.layout = createLayout(settings.layoutType, data.nodes.length);
    this.history.load(createModel(data, settings));
  }

  /** Makes the controls follow the model's settings, which a change, an undo or a redo alters. */
  private syncSettings(): void {
    const { layoutType, linkType, name, description } = this.model.modelData;
    this.diagramName.set(name);
    this.diagramDescription.set(description);
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
    // A drag or a text edit is in the middle of its own transaction; let it finish first.
    if (!this.history.rollBackUnfinished()) return;
    this.failure.set(null);
    this.clearHighlight();
    const { name, hasNext, step, showBusyFirst } = plan();
    this.busy.set(true);
    try {
      // Long runs block the main thread, so let the disabled buttons paint first.
      if (showBusyFirst) await afterNextPaint();

      this.measuring = true;
      const positionBefore = this.history.position;
      const start = performance.now();
      const result = timeSteps(hasNext, step);
      this.measuring = false;
      const paintedAt = await afterNextPaint();

      if (result.steps > 0) {
        // The transactions this operation recorded, undid or redid.
        const involved = this.history.transactionsBetween(positionBefore, this.history.position);
        const entry: LogEntry = {
          id: this.nextLogId++,
          op: name,
          steps: result.steps,
          changes: involved.reduce((sum, transaction) => sum + transaction.changes.count, 0),
          details: describeChanges(involved),
          totalMs: result.totalMs,
          avgMs: result.totalMs / result.steps,
          minMs: result.minMs,
          maxMs: result.maxMs,
          paintMs: paintedAt === null ? null : paintedAt - start,
        };
        this.log.update((entries) => [entry, ...entries].slice(0, MAX_LOG_ENTRIES));
      }
    } catch (error) {
      this.recoverFrom(error);
    } finally {
      this.measuring = false;
      this.refresh();
      this.busy.set(false);
    }
  }

  /** After an action failed: undoes what it had done so far, so that work can go on, and says so. */
  private recoverFrom(error: unknown): void {
    console.error('The action failed and was undone.', error);
    this.measuring = false;
    this.diagram.currentTool.doCancel();
    this.history.rollBackUnfinished();
    this.failure.set(FAILURE_NOTICE);
  }

  private refresh(): void {
    const memory = (performance as { memory?: { usedJSHeapSize: number } }).memory;
    this.stats.set({
      nodes: this.model.nodeDataArray.length,
      links: this.model.linkDataArray.length,
      historyLength: this.history.length,
      historyIndex: this.history.position,
      changedEvents: this.history.recordedChanges,
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
      heapMb: memory ? memory.usedJSHeapSize / 1048576 : null,
    });
    if (this.stylesDialog().nativeElement.open) this.refreshStyles();
    this.updateSearch();
    // The limit follows the node count, so a number typed for a bigger diagram may now be too high.
    if (this.bulkRuns() > this.maxBulkRuns()) this.bulkRuns.set(this.maxBulkRuns());
    this.stateCheck.set(this.history.describeState());
    this.syncSettings();
    this.syncSelection();
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
    // Shapes are picked for the selected nodes; without any, the column of shapes has nothing to do.
    if (nodes.length === 0) this.shapeMenuOpen.set(false);
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
