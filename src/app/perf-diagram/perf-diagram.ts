import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  VERSION,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import * as go from 'gojs/release/go';
import {
  BLANK_DATASET,
  BULK_EDIT_BUDGET,
  COLORS,
  DEFAULT_DATASET,
  DEFAULT_LAYOUT,
  DEFAULT_LINK_TYPE,
  LOG_OPEN_KEY,
  MAX_CHANGE_ROWS,
  STYLE_FIELDS,
} from '../diagram/constants';
import { DATASETS, findDataset } from '../diagram/datasets';
import {
  NodeModel,
  createDiagram,
  createModel,
  createOverview,
  revealNodesOneByOne,
} from '../diagram/diagram-factory';
import { HistoryService, StateCheck, withoutUndo } from '../diagram/history.service';
import { LAYOUTS, LayoutType, createLayout } from '../diagram/layouts';
import {
  LINK_TYPES,
  LinkType,
  avoidsNodes,
  linkStyle,
  tooBigToAvoidNodes,
} from '../diagram/link-types';
import { EditableField, LinkData, NodeData } from '../diagram/node-data';
import { SHAPE_TILES } from '../diagram/shape-tiles';
import { newBatchUrl } from '../new-batch/new-batch';
import { openInNewTab, readFlag, writeFlag } from './browser';
import { DiagramActions } from './diagram-actions';
import { diagramPicture, downloadDiagramPng } from './diagram-picture';
import { FundStyles, StyleDraft, StyleRow } from './fund-styles';
import { LinkInfoCard } from './link-info-card';
import { NodeSearch } from './node-search';
import { LogEntry, OperationRunner } from './operation-runner';
import { SelectionState } from './selection-state';

/** The numbers of the History panel. */
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

/** What the delete confirmation dialog is asking about. */
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
 * The page. It puts the pieces together and connects them to the template; the
 * work itself is done elsewhere:
 *
 * - `HistoryService`: the undo history.
 * - `OperationRunner`: runs and times operations, keeps the benchmark statistics.
 * - `DiagramActions`: every change to the diagram, each as one operation.
 * - `SelectionState`: what is selected, and the highlight that goes with it.
 * - `NodeSearch`: the search for nodes by name.
 * - `LinkInfoCard`: the card that an info icon opens.
 * - `FundStyles`: what is ticked and picked in the styles dialog.
 *
 * What is left here: creating the diagram and listening to it, loading data,
 * the dialogs and menus of the page, and the numbers of the History panel.
 */
@Component({
  selector: 'app-perf-diagram',
  templateUrl: './perf-diagram.html',
  styleUrl: './perf-diagram.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // One diagram per page, so everything that belongs to a diagram lives and dies with the page.
  providers: [
    HistoryService,
    OperationRunner,
    DiagramActions,
    SelectionState,
    NodeSearch,
    LinkInfoCard,
    FundStyles,
  ],
  // Escape puts the card of a relationship away, wherever the keyboard focus is.
  host: { '(document:keydown.escape)': 'closeLinkInfo()' },
})
export class PerfDiagram {
  private readonly history = inject(HistoryService);
  private readonly runner = inject(OperationRunner);
  private readonly actions = inject(DiagramActions);
  private readonly selection = inject(SelectionState);
  private readonly nodeSearch = inject(NodeSearch);
  private readonly linkCard = inject(LinkInfoCard);
  private readonly styles = inject(FundStyles);

  // ----- What the template offers to choose from -----

  protected readonly angularVersion = VERSION.full;
  protected readonly gojsVersion = go.Diagram.version;
  protected readonly datasets = DATASETS;
  protected readonly layouts = LAYOUTS;
  protected readonly linkTypes = LINK_TYPES;
  protected readonly shapeTiles = SHAPE_TILES;
  protected readonly colors = COLORS;
  protected readonly maxChangeRows = MAX_CHANGE_ROWS;

  // ----- State that the services own; the template reads it from here -----

  /** True while an operation runs, and from loading a diagram until it is fully shown. */
  protected readonly busy = this.runner.busy;
  /** The benchmark statistics. */
  protected readonly log = this.runner.log;
  /** What to tell the user after an action failed; null when the last action went well. */
  protected readonly failure = this.runner.failure;
  protected readonly selected = this.selection.selected;
  protected readonly selectedLinks = this.selection.selectedLinks;
  protected readonly linksOfSelectedNodes = this.selection.linksOfSelectedNodes;
  protected readonly shapeScope = this.selection.shapeScope;
  protected readonly searchQuery = this.nodeSearch.query;
  protected readonly searchMatches = this.nodeSearch.matches;
  protected readonly searchIndex = this.nodeSearch.index;
  protected readonly searchSummary = this.nodeSearch.summary;
  /** The relationship whose card is open. */
  protected readonly linkInfo = this.linkCard.info;
  protected readonly styleFields = STYLE_FIELDS;
  /** The legal entity field the styles dialog groups the nodes by; null until one is chosen. */
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

  // ----- State of the page itself -----

  /** Id of the dataset the diagram was loaded with. */
  protected readonly datasetId = signal(DEFAULT_DATASET);
  protected readonly layoutType = signal<LayoutType>(DEFAULT_LAYOUT);
  protected readonly linkType = signal<LinkType>(DEFAULT_LINK_TYPE);
  /** The diagram's name and description, as shown in the bar above the canvas. */
  protected readonly diagramName = signal('');
  protected readonly diagramDescription = signal('');
  /** Whether every relationship shows its card in the diagram ("expand all"). */
  protected readonly cardsExpanded = signal(false);
  protected readonly stats = signal<Stats | null>(null);
  protected readonly stateCheck = signal<StateCheck>({ label: '', ok: null });
  /** True when the diagram has no nodes; zooming and arranging make no sense then. */
  protected readonly isEmpty = computed(() => (this.stats()?.nodes ?? 0) === 0);

  /** The layout in use, with its name and icon, for the tool strip. */
  protected readonly currentLayout = computed(
    () => LAYOUTS.find((layout) => layout.type === this.layoutType()) ?? LAYOUTS[0],
  );
  /** The line type in use, with its name and icon, for the tool strip. */
  protected readonly currentLinkStyle = computed(() => linkStyle(this.linkType()));
  /** Which of the tool strip's columns of icons is open. */
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

  protected readonly bulkRuns = signal(50);
  /**
   * Most runs the bulk edit accepts: the number of nodes in the diagram, and
   * fewer on big diagrams, where that many runs would block the page for minutes.
   */
  protected readonly maxBulkRuns = computed(() => {
    const nodes = this.stats()?.nodes ?? 1;
    return Math.max(1, Math.min(nodes, Math.floor(BULK_EDIT_BUDGET / nodes)));
  });
  /** Whether the table of timings below the canvas is shown; closing it gives the canvas its room. */
  protected readonly logOpen = signal(readFlag(LOG_OPEN_KEY, true));

  /** A picture of the diagram while it is being printed. */
  protected readonly printImage = signal<string | null>(null);
  protected readonly deleteRequest = signal<DeleteRequest | null>(null);
  /** What is currently typed into the comment dialog; Save needs it to hold some text. */
  protected readonly commentDraft = signal('');
  /** The node whose comment is being edited in the comment dialog. */
  protected readonly commentTarget = signal<NodeData | null>(null);
  /** The node whose color is being chosen in the color dialog. */
  protected readonly colorTarget = signal<NodeData | null>(null);
  /** The operation whose changes are listed in the changes dialog. */
  protected readonly changesShown = signal<LogEntry | null>(null);

  // ----- Elements of the template -----

  private readonly host = viewChild.required<ElementRef<HTMLDivElement>>('diagramHost');
  private readonly overviewHost = viewChild.required<ElementRef<HTMLDivElement>>('overviewHost');
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
  /** Stops the animation in which a loaded diagram's nodes appear one by one. */
  private stopReveal: () => void = () => undefined;
  private stopWatchingErrors: () => void = () => undefined;

  constructor() {
    afterNextRender(() => this.init());
    // Shapes are picked for some nodes; without any, the column of shapes has nothing to do.
    effect(() => {
      if (!this.shapeScope()) this.shapeMenuOpen.set(false);
    });
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

  // ----- Starting up -----

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

    this.actions.connect(this.diagram);
    this.selection.connect(this.diagram);
    this.nodeSearch.connect(this.diagram);
    this.linkCard.connect(this.diagram);
    this.runner.connect(this.diagram, {
      // Anything the user does ends the highlight and puts an open card away.
      beforeEach: () => {
        this.selection.clearHighlight();
        this.linkCard.close();
      },
      afterEach: () => this.refresh(),
    });
    // The page shows numbers from the history, so it follows every change of it, also
    // the ones GoJS makes itself (dragging a node, drawing a relationship).
    this.history.connect(this.diagram, () => {
      if (!this.runner.isMeasuring) this.refresh();
    });
    // Ctrl/Cmd+Z and Ctrl/Cmd+Y do what the Undo and Redo buttons do, timing included.
    this.history.sendShortcutsTo(
      () => void this.undo(),
      () => void this.redo(),
    );
    // Same for the Delete key, which removes whatever is selected.
    this.diagram.commandHandler.deleteSelection = () => void this.deleteSelection();

    this.listenToDiagram();
    this.watchForErrors();
    this.loadModel(this.datasetId());
    this.refresh();
  }

  private listenToDiagram(): void {
    // The initial layout gives every node its place, so the starting state is saved after it.
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
      this.selection.highlightSelected();
      this.selection.sync();
      // Selecting something takes the attention away from an open card and from a search result.
      if (this.diagram.selection.count > 0) {
        this.linkCard.close();
        this.nodeSearch.leaveHit();
      }
    });
    this.diagram.addDiagramListener('ViewportBoundsChanged', (e) => {
      // Zooming by wheel or pinch counts as an action that ends the highlight.
      if (e.subject.scale !== this.diagram.scale) this.selection.clearHighlight();
      this.linkCard.follow();
    });
    this.diagram.addDiagramListener('BackgroundSingleClicked', () => this.linkCard.close());
  }

  /** Errors inside GoJS's own mouse and keyboard handling arrive here, not in an operation. */
  private watchForErrors(): void {
    const onError = (): void => {
      // A drag that is under way keeps its transaction, whatever went wrong elsewhere.
      if (this.diagram.currentTool !== this.diagram.defaultTool) return;
      if (this.runner.isMeasuring || !this.history.hasUnfinishedTransaction) return;
      this.runner.recoverFrom('An error left a transaction open.');
      this.refresh();
    };
    window.addEventListener('error', onError);
    this.stopWatchingErrors = () => window.removeEventListener('error', onError);
  }

  // ----- Loading data -----

  /** Starts a diagram from scratch: an empty canvas to add nodes and relationships to. */
  protected newDiagram(): void {
    this.reset(BLANK_DATASET);
  }

  /** Loads the dataset with this id from scratch, discarding the undo history. */
  protected reset(datasetId: string): void {
    this.loadModel(datasetId);
    this.datasetId.set(datasetId);
    this.runner.clearLog();
    this.refresh();
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
    this.linkCard.close();
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
      // A newly loaded diagram starts with its relationship cards put away,
      // and with nodes that show their name only.
      cardsExpanded: false,
      subtitleField: null,
    };
    this.busy.set(true);
    // A new model gets new parts: none of them dimmed, none of them a search result.
    this.selection.forgetHighlight();
    this.nodeSearch.clear();
    this.diagram.layout = createLayout(settings.layoutType, data.nodes.length);
    this.history.load(createModel(data, settings));
  }

  // ----- Keeping the page up to date -----

  /** Reads everything the page shows from the diagram and its history again. */
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
    if (this.stylesDialog().nativeElement.open) this.styles.refresh(this.model.nodeDataArray);
    this.styles.shownField.set(this.model.modelData.subtitleField);
    this.nodeSearch.update();
    // The limit follows the node count, so a number typed for a bigger diagram may now be too high.
    if (this.bulkRuns() > this.maxBulkRuns()) this.bulkRuns.set(this.maxBulkRuns());
    this.stateCheck.set(this.history.describeState());
    // A relationship that GoJS removed or moved by itself (the Delete key, a drag).
    this.linkCard.follow();
    this.syncSettings();
    this.selection.sync();
  }

  /** Makes the controls follow the model's settings, which a change, an undo or a redo alters. */
  private syncSettings(): void {
    const { layoutType, linkType, name, description, cardsExpanded } = this.model.modelData;
    this.cardsExpanded.set(cardsExpanded);
    this.diagramName.set(name);
    this.diagramDescription.set(description);
    this.linkType.set(linkType);
    if (layoutType === this.layoutType()) return;
    this.layoutType.set(layoutType);
    this.actions.zoomToFitSoon();
  }

  // ----- History -----

  protected undo(): Promise<void> {
    return this.actions.undo();
  }

  protected redo(): Promise<void> {
    return this.actions.redo();
  }

  protected undoAll(): Promise<void> {
    return this.actions.undoAll();
  }

  protected redoAll(): Promise<void> {
    return this.actions.redoAll();
  }

  // ----- Random edits for the benchmark -----

  protected randomizeOne(): Promise<void> {
    return this.actions.randomize('Randomize 1 node', 1, (nodes) => [
      nodes[Math.floor(Math.random() * nodes.length)],
    ]);
  }

  protected randomizeAll(): Promise<void> {
    return this.actions.randomize('Randomize all nodes', 1, (nodes) => nodes);
  }

  protected runBulk(): Promise<void> {
    // The limit may have dropped since the number was typed, e.g. after loading a bigger diagram.
    const runs = this.validBulkRuns(this.bulkRuns());
    this.bulkRuns.set(runs);
    return this.actions.randomize(`${runs} × randomize all nodes`, runs, (nodes) => nodes);
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

  // ----- Nodes -----

  protected addNode(): Promise<void> {
    return this.actions.addNode();
  }

  /** Sets one field on every selected node, as a single undo step. */
  protected editSelected(field: EditableField, value: string): Promise<void> {
    return this.actions.setField(() => this.selection.selectedNodes(), field, value);
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
    return this.actions.setField(() => (node ? [node] : []), 'color', color);
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
    return this.actions.setField(() => (node ? [node] : []), 'comment', text.trim());
  }

  /** Gives the nodes of the Shape tool the picked shape; its column of icons then closes. */
  protected pickShape(shape: string): Promise<void> {
    this.shapeMenuOpen.set(false);
    // Taken now: carrying out the change ends the highlight that says which nodes are meant.
    const nodes = this.selection.shapeTargets();
    return this.actions.setField(() => nodes, 'shape', shape);
  }

  // ----- Deleting -----

  /**
   * What the Delete key does: asks before deleting when nodes are selected, and
   * removes selected relationships straight away when only those are selected.
   */
  protected deleteSelection(): Promise<void> | void {
    const nodes = this.selection.selectedNodes();
    if (nodes.length > 0) return this.askToDelete(nodes, this.selection.selectedLinkData());
    return this.removeSelectedLinks();
  }

  /** Asks before deleting the selected nodes. */
  protected deleteSelectedNodes(): void {
    this.askToDelete(this.selection.selectedNodes());
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

  /** Deletes what the confirmation dialog asked about. */
  protected confirmDelete(): Promise<void> {
    const request = this.deleteRequest();
    this.cancelDelete();
    return this.actions.deleteNodes(request?.keys ?? [], request?.links ?? []);
  }

  // ----- Relationships -----

  /** Removes the relationships that are selected themselves. */
  protected removeSelectedLinks(): Promise<void> {
    return this.actions.removeLinks(() => this.selection.selectedLinkData());
  }

  /** Removes every relationship that starts or ends at one of the selected nodes. */
  protected removeLinksOfSelectedNodes(): Promise<void> {
    return this.actions.removeLinks(() => this.selection.linkDataOfSelectedNodes());
  }

  /** Shows the card of a relationship beside its info icon; a second click puts it away. */
  private showLinkInfo(link: LinkData): void {
    this.linkCard.show(link);
  }

  protected closeLinkInfo(): void {
    this.linkCard.close();
  }

  /** Removes the relationship whose card is open. */
  protected removeInfoLink(): Promise<void> {
    const link = this.linkInfo()?.link;
    this.closeLinkInfo();
    return this.actions.removeLinks(() => (link ? [link] : []));
  }

  /** Shows the card of every relationship, with the nodes further apart to make room. */
  protected expandCards(): Promise<void> {
    return this.actions.showCards(true);
  }

  /** Hides the cards of all relationships and arranges the nodes close together again. */
  protected collapseCards(): Promise<void> {
    return this.actions.showCards(false);
  }

  // ----- Styles by fund type -----

  /** Opens the dialog in which color and shape are set per value of a legal entity field. */
  protected openStyles(): void {
    this.styles.open(this.model.nodeDataArray, this.model.modelData.subtitleField);
    this.stylesDialog().nativeElement.showModal();
  }

  protected closeStyles(): void {
    this.stylesDialog().nativeElement.close();
  }

  /** Takes over the field picked in the dropdown of the styles dialog; "" means none. */
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
   * Applies the styles dialog as one undo step and closes it: the chosen field
   * is shown as the subtitle of every node, and the nodes of the ticked values
   * get the picked color and shape. Either of the two can be done alone. Nothing
   * in the diagram changes before this is called.
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

  // ----- Layout, lines and the tool strip -----

  protected changeLayout(type: LayoutType): Promise<void> {
    return this.actions.changeLayout(type);
  }

  protected autoArrange(): Promise<void> {
    return this.actions.autoArrange();
  }

  protected changeLinkType(type: LinkType): Promise<void> {
    return this.actions.changeLinkType(type);
  }

  /** Opens or closes one of the tool strip's columns of icons; only one is open at a time. */
  protected toggleMenu(menu: 'layout' | 'lines' | 'shape'): void {
    const layout = menu === 'layout' && !this.layoutMenuOpen();
    const lines = menu === 'lines' && !this.linkMenuOpen();
    const shape = menu === 'shape' && !this.shapeMenuOpen();
    this.layoutMenuOpen.set(layout);
    this.linkMenuOpen.set(lines);
    this.shapeMenuOpen.set(shape);
  }

  /** Picks a layout from the tool strip's column of icons, which then closes. */
  protected pickLayout(type: LayoutType): Promise<void> {
    this.layoutMenuOpen.set(false);
    return this.changeLayout(type);
  }

  /** Picks a line type from the tool strip's column of icons, which then closes. */
  protected pickLinkType(type: LinkType): Promise<void> {
    this.linkMenuOpen.set(false);
    return this.changeLinkType(type);
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

  protected zoomIn(): void {
    this.diagram.commandHandler.increaseZoom();
  }

  protected zoomOut(): void {
    this.diagram.commandHandler.decreaseZoom();
  }

  protected zoomToFit(): void {
    this.selection.clearHighlight();
    this.diagram.zoomToFit();
  }

  // ----- Name, description and search -----

  /** Takes over the name or description typed above the canvas, as one undo step. */
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

  // ----- Export, print and the benchmark statistics -----

  /** Carries out what was picked in the Actions dropdown and puts the dropdown back. */
  protected runAction(menu: HTMLSelectElement): void {
    const action = menu.value;
    menu.value = '';
    if (action === 'export-png') this.exportPng();
    if (action === 'print') this.print();
  }

  /** Downloads a picture of the whole diagram as a PNG file named after the diagram. */
  protected exportPng(): void {
    // The picture shows the diagram as it is, with nothing dimmed.
    this.selection.clearHighlight();
    downloadDiagramPng(this.diagram, this.model.modelData.name);
  }

  /**
   * Prints the whole diagram. A picture of it is put on the page, where the
   * print style sheet shows it instead of the app; printing starts once the
   * picture has loaded.
   */
  protected print(): void {
    this.selection.clearHighlight();
    this.printImage.set(diagramPicture(this.diagram));
  }

  protected printLoaded(): void {
    window.print();
    this.printImage.set(null);
  }

  /** Opens or closes the benchmark statistics below the canvas, and remembers the choice. */
  protected toggleLog(): void {
    this.logOpen.update((open) => !open);
    writeFlag(LOG_OPEN_KEY, this.logOpen());
    // The canvas grows or shrinks with it; GoJS has to be told once the page is laid out again.
    requestAnimationFrame(() => this.diagram.requestUpdate());
  }

  /** Opens the list of what an operation in the statistics changed. */
  protected showChanges(entry: LogEntry): void {
    this.changesShown.set(entry);
    this.changesDialog().nativeElement.showModal();
  }

  protected closeChanges(): void {
    this.changesDialog().nativeElement.close();
  }

  protected formatMs(value: number | null): string {
    if (value === null) return '–';
    return value < 10 ? value.toFixed(2) : value.toFixed(1);
  }
}
