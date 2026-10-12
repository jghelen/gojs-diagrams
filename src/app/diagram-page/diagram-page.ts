import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import * as go from 'gojs/release/go';
import { DiagramsApi, nodesAndLinksOf } from '../api/diagrams-api';
import {
  BLANK_DATASET,
  DEFAULT_DATASET,
  DEFAULT_LAYOUT,
  DEFAULT_LINK_TYPE,
  DIAGRAM_NOT_READ_NOTICE,
  LEAVE_QUESTION,
  LOAD_FAILURE_NOTICE,
  NO_SUCH_DIAGRAM_NOTICE,
  QUICK_LAYOUTS,
  SLOW_LAYOUTS_FROM,
  STORED_DATASET,
  StyleFieldId,
} from '../diagram/constants';
import { findDataset } from '../diagram/datasets';
import { checkedDiagramName } from '../diagram/diagram-name';
import {
  NodeModel,
  createDiagram,
  createModel,
  createOverview,
  revealNodesOneByOne,
  syncLinkCards,
} from '../diagram/diagram-factory';
import { HistoryService, withoutUndo } from '../diagram/history.service';
import { createLayout } from '../diagram/layouts';
import { LinkData, NodeData } from '../diagram/node-data';
import { newBatchUrl } from '../new-batch/new-batch';
import { confirmWithUser, openInNewTab } from './browser';
import { BenchmarkStatistics } from './components/benchmark-statistics/benchmark-statistics';
import { DiagramInfoBar } from './components/diagram-info-bar/diagram-info-bar';
import { NodeDialogs } from './components/node-dialogs/node-dialogs';
import { PageFooter } from './components/page-footer/page-footer';
import { PageHeader } from './components/page-header/page-header';
import { RelationshipCard } from './components/relationship-card/relationship-card';
import { SidePanel } from './components/side-panel/side-panel';
import { StylesDialog } from './components/style-dialog/styles-dialog';
import { ToolStrip } from './components/tool-strip/tool-strip';
import { DeveloperTools } from './developer-tools';
import { DiagramActions } from './diagram-actions';
import { diagramPicture, downloadDiagramPng } from './export-to-png/diagram-picture';
import { DiagramState } from './diagram-state/diagram-state';
import { FundStyles } from './fund-styles';
import { LinkInfoCard } from './link-info-card/link-info-card';
import { NodeSearch } from './node-search/node-search';
import { OperationRunner } from './operation-runner/operation-runner';
import { SelectionState } from './selection-state/selection-state';

/** How long after an error a diagram that is being opened is given to arrive after all. */
const LOAD_PATIENCE_MS = 100;

/** What a diagram that is being opened brings along besides its nodes and lines. */
interface OpenedSettings {
  name: string;
  description?: string;
  cardsExpanded?: boolean;
  subtitleField?: StyleFieldId | null;
}

/**
 * The page. It creates the diagram, loads data into it, and keeps everything
 * around it up to date. The data is the one picked in the Data dropdown, or,
 * at the address /diagrams/<id>, that diagram of the database.
 *
 * What the user sees and does is in its parts:
 *
 * - `PageHeader`: the bar at the top, with the data and the actions on the whole diagram.
 * - `DiagramInfoBar`: name, description and search, above the canvas.
 * - `ToolStrip`: the tools on the left edge of the canvas.
 * - `RelationshipCard`: the card that an info icon opens.
 * - `BenchmarkStatistics`: the table of timings below the canvas.
 * - `SidePanel`: history numbers, random edits and the selection, on the right.
 * - `NodeDialogs`: color, comment and delete confirmation of a node.
 * - `StylesDialog`: styles by legal entity field.
 * - `PageFooter`: the versions the app is built with, in small print at the bottom.
 *
 * The parts do not talk to each other. They share the services that the page
 * provides, one set per diagram:
 *
 * - `HistoryService`: the undo history.
 * - `OperationRunner`: runs and times operations, keeps the benchmark statistics.
 * - `DiagramActions`: every change to the diagram, each as one operation.
 * - `DiagramState`: the settings, the name and the history numbers that are shown.
 * - `SelectionState`: what is selected, and the highlight that goes with it.
 * - `NodeSearch`: the search for nodes by name.
 * - `LinkInfoCard`: which relationship's card is open, and where.
 * - `FundStyles`: what is ticked and picked in the styles dialog.
 * - `DeveloperTools`: whether the statistics, history numbers and random edits are shown.
 */
@Component({
  selector: 'app-diagram-page',
  templateUrl: './diagram-page.html',
  styleUrl: './diagram-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Closing or reloading the tab would lose the changes: see confirmLeaving.
  host: { '(window:beforeunload)': 'confirmLeaving($event)' },
  imports: [
    PageHeader,
    PageFooter,
    DiagramInfoBar,
    ToolStrip,
    RelationshipCard,
    BenchmarkStatistics,
    SidePanel,
    NodeDialogs,
    StylesDialog,
  ],
  // One diagram per page, so everything that belongs to a diagram lives and dies with the page.
  providers: [
    HistoryService,
    OperationRunner,
    DiagramActions,
    DiagramState,
    SelectionState,
    NodeSearch,
    LinkInfoCard,
    FundStyles,
    DeveloperTools,
  ],
})
export class DiagramPage {
  private readonly history = inject(HistoryService);
  private readonly runner = inject(OperationRunner);
  private readonly actions = inject(DiagramActions);
  private readonly state = inject(DiagramState);
  private readonly selection = inject(SelectionState);
  private readonly nodeSearch = inject(NodeSearch);
  private readonly linkCard = inject(LinkInfoCard);
  private readonly styles = inject(FundStyles);
  private readonly developerTools = inject(DeveloperTools);
  private readonly api = inject(DiagramsApi);
  private readonly router = inject(Router);

  /**
   * From the address /diagrams/<id>: the id of the diagram of the database to
   * show. Not set at the address "/", where the Data dropdown says what is shown.
   */
  readonly id = input<string>();

  /** Id of the dataset the diagram was loaded with. */
  protected readonly datasetId = signal(DEFAULT_DATASET);
  /** What to tell the user after an action failed; null when the last action went well. */
  protected readonly failure = this.runner.failure;
  /** True while the side panel lies over the right edge of the canvas; the overview then makes room. */
  protected readonly panelOverCanvas = computed(
    () =>
      !this.developerTools.shown() &&
      (this.selection.selected() !== null || this.selection.selectedLinks() > 0),
  );
  /** A picture of the diagram while it is being printed. */
  protected readonly printImage = signal<string | null>(null);

  // ----- Elements and parts of the template -----

  private readonly host = viewChild.required<ElementRef<HTMLDivElement>>('diagramHost');
  private readonly overviewHost = viewChild.required<ElementRef<HTMLDivElement>>('overviewHost');
  private readonly nodeDialogs = viewChild.required(NodeDialogs);
  private readonly stylesDialog = viewChild.required(StylesDialog);

  private diagram!: go.Diagram;
  /** The small picture of the whole diagram in the corner of the canvas. */
  private overview!: go.Overview;
  /** Stops the animation in which a loaded diagram's nodes appear one by one. */
  private stopReveal: () => void = () => undefined;
  private stopWatchingErrors: () => void = () => undefined;
  private stopWatchingCanvasSize: () => void = () => undefined;
  /** True from the moment data is opened until GoJS has arranged it for the first time. */
  private loading = false;
  /** True while a diagram of the database is on its way from the backend. */
  private waitingForStored = false;
  /** Counts what was opened, so that a diagram arriving late knows it is no longer wanted. */
  private openings = 0;
  /** The id in the address that the page last acted on. */
  private addressId: string | undefined;

  constructor() {
    afterNextRender(() => {
      this.addressId = this.id();
      if (this.addressId !== undefined) this.datasetId.set(STORED_DATASET);
      this.init();
    });
    // The address can change while the page stays: see followAddress.
    effect(() => {
      const id = this.id();
      untracked(() => this.followAddress(id));
    });
    // The statistics below the canvas come and go with the developer tools.
    effect(() => {
      this.developerTools.shown();
      this.canvasResized();
    });
    inject(DestroyRef).onDestroy(() => {
      // A diagram still on its way from the backend has nowhere to go any more.
      this.openings++;
      this.stopReveal();
      this.stopWatchingErrors();
      this.stopWatchingCanvasSize();
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
      // A second click on the same info icon puts its card away again.
      onLinkInfo: (link) => this.linkCard.show(link),
      onNodeColor: (node) => this.nodeDialogs().showColorPicker(node),
      onNodeComment: (node) => this.nodeDialogs().showComment(node),
      // A new tab, so the diagram and its undo history stay as they are.
      onNodeBatch: (node) => openInNewTab(newBatchUrl(node.key)),
      onNodeDelete: (node) => this.askToDelete([node]),
    });
    this.overview = createOverview(this.overviewHost().nativeElement, this.diagram);
    this.watchCanvasSize();

    this.actions.connect(this.diagram);
    this.state.connect(this.diagram);
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
      () => void this.actions.undo(),
      () => void this.actions.redo(),
    );
    // Same for the Delete key, which removes whatever is selected.
    this.diagram.commandHandler.deleteSelection = () => void this.deleteSelection();

    this.listenToDiagram();
    this.watchForErrors();
    this.open(this.datasetId());
    this.refresh();
  }

  private listenToDiagram(): void {
    // The initial layout gives every node its place, so the starting state is saved after it.
    this.diagram.addDiagramListener('InitialLayoutCompleted', () => {
      this.loading = false;
      this.history.markInitialState();
      // GoJS clears the history right after this event; read the numbers once it has.
      queueMicrotask(() => this.refresh());
      // The nodes now appear one by one; everything stays disabled until they are all there.
      this.overview.isEnabled = false;
      this.stopReveal = revealNodesOneByOne(this.diagram, () => {
        this.overview.isEnabled = true;
        // The empty canvas shown while a stored diagram is on its way stays locked.
        this.runner.busy.set(this.waitingForStored);
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

  /**
   * Tells GoJS whenever the canvas gets another size, whatever the reason: the
   * statistics opened, a note appeared above it, the window was resized.
   */
  private watchCanvasSize(): void {
    this.stopWatchingCanvasSize();
    // Not there in every environment the page runs in, such as the tests.
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => this.diagram.requestUpdate());
    observer.observe(this.host().nativeElement);
    this.stopWatchingCanvasSize = () => observer.disconnect();
  }

  /** Errors inside GoJS's own mouse and keyboard handling arrive here, not in an operation. */
  private watchForErrors(): void {
    const onError = (): void => {
      if (this.loading) {
        // Perhaps the error had nothing to do with the diagram; a moment shows whether
        // the diagram still arrives.
        setTimeout(() => this.giveUpLoading(), LOAD_PATIENCE_MS);
        return;
      }
      // A drag that is under way keeps its transaction, whatever went wrong elsewhere.
      if (this.diagram.currentTool !== this.diagram.defaultTool) return;
      if (this.runner.isMeasuring || !this.history.hasUnfinishedTransaction) return;
      this.runner.recoverFrom('An error left a transaction open.');
      this.refresh();
    };
    window.addEventListener('error', onError);
    this.stopWatchingErrors = () => window.removeEventListener('error', onError);
  }

  /**
   * An error stopped a diagram on its way in. After an error inside a layout
   * GoJS arranges nothing any more, in this diagram or in any data opened in it
   * later, and it is the end of the first layout that unlocks the page. Without
   * this, every control would stay disabled until the page is reloaded.
   *
   * So the diagram is thrown away and a new, empty one put in its place, in the
   * default layout and line type in case one of those was the cause. The page
   * says what happened, and the user can open other data.
   */
  private giveUpLoading(): void {
    if (!this.loading) return;
    this.loading = false;
    this.stopReveal();
    this.stopWatchingErrors();
    this.overview.div = null;
    this.diagram.div = null;

    this.datasetId.set(BLANK_DATASET);
    this.state.layoutType.set(DEFAULT_LAYOUT);
    this.state.linkType.set(DEFAULT_LINK_TYPE);
    this.runner.clearLog();
    this.init();
    this.failure.set(LOAD_FAILURE_NOTICE);
  }

  // ----- Loading data -----

  /** Loads the dataset with this id from scratch, discarding the undo history. */
  protected reset(datasetId: string): void {
    this.datasetId.set(datasetId);
    this.open(datasetId);
    this.runner.clearLog();
    this.refresh();
    // The app's own data has no address: that of a stored diagram no longer fits.
    if (datasetId !== STORED_DATASET && this.id() !== undefined)
      void this.router.navigateByUrl('/');
  }

  /** Opens the dataset with this id, or the diagram of the address for STORED_DATASET. */
  private open(datasetId: string): void {
    // Whatever was on its way from the backend is no longer wanted.
    this.openings++;
    this.waitingForStored = false;
    if (datasetId === STORED_DATASET) {
      void this.openStored();
      return;
    }
    const dataset = findDataset(datasetId);
    // A loaded diagram starts out named after its data; a new one has to be given a name.
    this.loadModel(dataset.create(), { name: datasetId === BLANK_DATASET ? '' : dataset.label });
  }

  /**
   * Opens the diagram of the address from the database: with its own layout
   * type, line type and settings, and its nodes where they were stored.
   *
   * The canvas is empty and everything is disabled until the diagram is here.
   * If it does not come, the canvas stays empty and the page says why.
   */
  private async openStored(): Promise<void> {
    const id = this.id();
    const opening = this.openings;
    this.loadModel({ nodes: [], links: [] }, { name: '' });
    if (id === undefined) return;
    this.waitingForStored = true;
    try {
      const stored = await this.api.read(id);
      // Something else was opened in the meantime, or the page was left.
      if (opening !== this.openings) return;
      this.waitingForStored = false;
      this.state.layoutType.set(stored.settings.layoutType);
      this.state.linkType.set(stored.settings.linkType);
      this.loadModel(nodesAndLinksOf(stored), stored.settings);
      this.refresh();
    } catch (error) {
      if (opening !== this.openings) return;
      this.waitingForStored = false;
      // Unless the empty canvas is itself still being set up, which then unlocks the page.
      if (!this.loading) this.runner.busy.set(false);
      const missing = error instanceof HttpErrorResponse && error.status === 404;
      this.failure.set(missing ? NO_SUCH_DIAGRAM_NOTICE : DIAGRAM_NOT_READ_NOTICE);
    }
  }

  /**
   * The address changed while the page stayed, which the browser's Back and
   * Forward buttons do between "/" and "/diagrams/<id>": show what the new
   * address says. A change of address that the page made itself, after sample
   * data was picked, finds the diagram already as it should be.
   */
  private followAddress(id: string | undefined): void {
    // Not started yet: starting up opens what the address says.
    if (!this.diagram || id === this.addressId) return;
    this.addressId = id;
    if (id !== undefined) this.reset(STORED_DATASET);
    else if (this.datasetId() === STORED_DATASET) this.reset(DEFAULT_DATASET);
  }

  /**
   * Loads a fresh model with these nodes and lines, in the currently selected
   * layout and line type.
   */
  private loadModel(data: { nodes: NodeData[]; links: LinkData[] }, opened: OpenedSettings): void {
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
    // Nodes that all have a position, as those of a stored diagram do once it
    // has been arranged, stay where they are: nothing is laid out.
    const placed = data.nodes.length > 0 && data.nodes.every((node) => node.loc !== undefined);
    // The circle, layered and force-directed layouts take many seconds on a big
    // diagram. One of them may be in use from a smaller diagram; a big one is then
    // opened in the default layout rather than keeping the user waiting.
    if (
      !placed &&
      data.nodes.length >= SLOW_LAYOUTS_FROM &&
      !QUICK_LAYOUTS.includes(this.state.layoutType())
    ) {
      this.state.layoutType.set(DEFAULT_LAYOUT);
    }
    // A name that arrives with special characters, as one from a database may, is
    // shown without them, and the page says which name it did not accept.
    const name = checkedDiagramName(opened.name);
    this.state.refusedName.set(name.refused);
    const settings = {
      layoutType: this.state.layoutType(),
      linkType: this.state.linkType(),
      name: name.name,
      description: opened.description ?? '',
      // Unless it was stored otherwise, a diagram starts with its relationship
      // cards put away, and with nodes that show their name only.
      cardsExpanded: opened.cardsExpanded ?? false,
      subtitleField: opened.subtitleField ?? null,
    };
    this.runner.busy.set(true);
    this.loading = true;
    // A new model gets new parts: none of them dimmed, none of them a search result.
    this.selection.forgetHighlight();
    this.nodeSearch.clear();
    const layout = createLayout(settings.layoutType, data.nodes.length, settings.cardsExpanded);
    layout.isInitial = !placed;
    this.diagram.layout = layout;
    this.history.load(createModel(data, settings));
  }

  // ----- Keeping the page up to date -----

  /** Reads everything the page shows from the diagram and its history again. */
  private refresh(): void {
    const layoutBefore = this.state.layoutType();
    this.state.refresh();
    // Another layout, by an action, an undo or a redo, arranged the nodes anew: show all of them.
    if (this.state.layoutType() !== layoutBefore) this.actions.zoomToFitSoon();

    if (this.stylesDialog().isOpen) this.styles.refresh(this.model.nodeDataArray);
    this.styles.shownField.set(this.model.modelData.subtitleField);
    this.nodeSearch.update();
    // A relationship that GoJS removed or moved by itself (the Delete key, a drag).
    this.linkCard.follow();
    // After an action that failed halfway, the cards may not match the model any more.
    syncLinkCards(this.diagram);
    this.selection.sync();
  }

  /** The canvas got a new size; GoJS has to be told once the page is laid out again. */
  protected canvasResized(): void {
    requestAnimationFrame(() => this.diagram?.requestUpdate());
  }

  // ----- Deleting -----

  /**
   * What the Delete key does: asks before deleting when nodes are selected, and
   * removes selected relationships straight away when only those are selected.
   */
  protected deleteSelection(): Promise<void> | void {
    const nodes = this.selection.selectedNodes();
    if (nodes.length > 0) return this.askToDelete(nodes, this.selection.selectedLinkData());
    return this.actions.removeLinks(() => this.selection.selectedLinkData());
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
    this.nodeDialogs().confirmDeletion({
      keys: [...keys],
      links,
      title: nodes.length === 1 ? nodes[0].title : null,
      attached: attached.length,
    });
  }

  // ----- Leaving the page -----

  /**
   * Asked by the router before another page of the app, such as the list of
   * diagrams, takes the place of this one. With changes in the diagram the user
   * is asked first, as on closing the tab; here the question can be the app's own.
   */
  mayLeave(): boolean {
    return !this.history.canUndo || confirmWithUser(LEAVE_QUESTION);
  }

  /**
   * Asks before the tab is closed or reloaded, or left for another address,
   * while the diagram has changes: nothing is saved anywhere, so they would be
   * lost. A diagram as it was opened, or with every change undone, is let go
   * without a question.
   *
   * The question itself is the browser's own ("Leave site? Changes you made may
   * not be saved"). A page is not allowed to show a dialog of its own at that
   * moment, or to change the words; all it can do is ask for the question.
   */
  protected confirmLeaving(event: BeforeUnloadEvent): void {
    if (!this.history.canUndo) return;
    event.preventDefault();
    // What browsers looked at before they honoured preventDefault here.
    event.returnValue = true;
  }

  // ----- Styles, export and print -----

  /** Opens the dialog in which color and shape are set per value of a legal entity field. */
  protected openStyles(): void {
    this.styles.open(this.model.nodeDataArray, this.model.modelData.subtitleField);
    this.stylesDialog().show();
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
}
