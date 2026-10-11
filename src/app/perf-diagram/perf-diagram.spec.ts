import { ComponentFixture, TestBed } from '@angular/core/testing';
import * as go from 'gojs/release/go';
import { NodeModel } from '../diagram/diagram-factory';
import { DEFAULT_COLOR, DEFAULT_SHAPE, LinkData, NodeData } from '../diagram/node-data';
import { PerfDiagram } from './perf-diagram';

/** The parts of the component these tests drive; most of them are not public. */
interface Bench {
  diagram: go.Diagram;
  busy(): boolean;
  datasetId(): string;
  layoutType(): string;
  linkType(): string;
  stats(): { nodes: number; links: number; historyLength: number; historyIndex: number } | null;
  stateCheck(): { label: string; ok: boolean | null };
  log(): { op: string; steps: number; changes: number }[];
  selected(): { count: number; title: string | null; color: string | null } | null;
  bulkRuns: { (): number; set(value: number): void };
  maxBulkRuns(): number;
  setBulkRuns(input: HTMLInputElement): void;
  undo(): Promise<void>;
  redo(): Promise<void>;
  undoAll(): Promise<void>;
  redoAll(): Promise<void>;
  randomizeOne(): Promise<void>;
  randomizeAll(): Promise<void>;
  runBulk(): Promise<void>;
  addNode(): Promise<void>;
  editSelected(field: string, value: string): Promise<void>;
  changeLayout(type: string): Promise<void>;
  changeLinkType(type: string): Promise<void>;
  autoArrange(): Promise<void>;
  zoomIn(): void;
  zoomOut(): void;
  zoomToFit(): void;
  reset(datasetId: string): void;
  removeSelectedLinks(): Promise<void>;
  removeLinksOfSelectedNodes(): Promise<void>;
  deleteSelection(): Promise<void> | void;
  deleteSelectedNodes(): void;
  askToDelete(nodes: NodeData[], links?: LinkData[]): void;
  deleteRequest(): { keys: number[]; attached: number; title: string | null } | null;
  cancelDelete(): void;
  confirmDelete(): Promise<void>;
  showComment(node: NodeData): void;
  commentDraft: { (): string; set(value: string): void };
  saveComment(text: string): Promise<void>;
  showColorPicker(node: NodeData): void;
  pickColor(color: string): Promise<void>;
  showLinkInfo(link: LinkData): void;
  linkInfo(): { ownership: string | null; from: NodeData | null } | null;
  removeInfoLink(): Promise<void>;
  openStyles(): void;
  styleRows(): { type: string; count: number; color: string | null; shape: string | null }[];
  styleTypes(): ReadonlySet<string>;
  toggleStyleType(type: string): void;
  selectAllStyleTypes(all: boolean): void;
  allStyleTypesSelected(): boolean;
  chooseStyle(field: 'color' | 'shape', value: string): void;
  styleDraft(): { color: string | null; shape: string | null };
  canApplyStyle(): boolean;
  nodePreview(): { fill: string; subtitle: string };
  applyStyles(): Promise<void>;
  askToResetStyles(): void;
  cancelResetStyles(): void;
  confirmResetStyles(): Promise<void>;
}

const INITIAL = 'Initial state: matches the startup snapshot';
const LATEST = 'Latest state: matches the snapshot taken before undo';

describe('PerfDiagram', () => {
  let fixture: ComponentFixture<PerfDiagram>;
  let bench: Bench;
  let diagram: go.Diagram;
  let page: HTMLElement;

  const model = () => diagram.model as NodeModel;
  const nodeData = (key: number) => model().findNodeDataForKey(key)!;
  const dialog = (heading: string): HTMLDialogElement =>
    Array.from(page.querySelectorAll('dialog')).find((element) =>
      element.querySelector('h2')?.textContent?.includes(heading),
    )!;
  /** Lets GoJS finish what it would do before the next frame, and Angular redraw. */
  const settle = async () => {
    for (let i = 0; i < 3; i++) diagram.maybeUpdate();
    await fixture.whenStable();
  };
  const select = async (...keys: number[]) => {
    diagram.selectCollection(keys.map((key) => diagram.findNodeForKey(key)!));
    await settle();
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [PerfDiagram] });
    fixture = TestBed.createComponent(PerfDiagram);
    fixture.detectChanges();
    await fixture.whenStable();
    bench = fixture.componentInstance as unknown as Bench;
    diagram = bench.diagram;
    page = fixture.nativeElement as HTMLElement;
    // jsdom gives the canvas no size; this is how GoJS is told the size of the view without one.
    diagram.viewSize = new go.Size(1000, 700);
    await settle();
  });

  describe('loading', () => {
    it('opens with the 30-node diagram, laid out top to bottom with lines that avoid nodes', () => {
      expect(bench.busy()).toBe(false);
      expect(bench.datasetId()).toBe('30');
      expect(bench.stats()).toMatchObject({ nodes: 30, historyLength: 0, historyIndex: -1 });
      expect(bench.layoutType()).toBe('top-bottom');
      expect(bench.linkType()).toBe('avoid');
      expect(bench.stateCheck()).toEqual({ label: INITIAL, ok: true });
    });

    it('starts every node as a light gray rectangle', () => {
      for (const node of model().nodeDataArray) {
        expect(node.shape).toBe(DEFAULT_SHAPE);
        expect(node.color).toBe(DEFAULT_COLOR);
      }
    });

    it('loads another dataset from scratch on reset, keeping layout and line type', async () => {
      await bench.changeLayout('grid');
      bench.reset('fund-structure');
      await settle();
      expect(bench.stats()).toMatchObject({ nodes: 24, historyLength: 0 });
      expect(bench.layoutType()).toBe('grid');
      expect(bench.log()).toEqual([]);
      expect(bench.stateCheck().ok).toBe(true);
    });
  });

  describe('loading animation', () => {
    const overview = () =>
      (fixture.componentInstance as unknown as { overview: go.Overview }).overview;
    /** The controls on the page itself; those of the dialogs are not on screen. */
    const controls = () =>
      Array.from(
        page.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>(
          'button, input, select',
        ),
      ).filter((control) => !control.closest('dialog'));
    const visibleNodes = () => {
      let count = 0;
      diagram.nodes.each((node) => (count += node.opacity === 1 ? 1 : 0));
      return count;
    };
    let frames: FrameRequestCallback[];

    /** Draws frames, as a browser would, until the page asks for no more. */
    const drawFrames = async (time: number) => {
      const now = vi.spyOn(performance, 'now').mockReturnValue(time);
      for (let i = 0; i < 20 && frames.length > 0; i++) {
        for (const frame of frames.splice(0)) frame(time);
      }
      now.mockRestore();
      await settle();
    };

    beforeEach(() => {
      // A page that is on screen, with frames that are only drawn when the test says so.
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      frames = [];
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) =>
        frames.push(callback),
      );
    });

    afterEach(() => {
      vi.restoreAllMocks();
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    });

    it('keeps every control, the diagram and the overview disabled until all nodes are shown', async () => {
      bench.reset('fund-structure');
      await settle();
      expect(bench.busy()).toBe(true);
      expect(visibleNodes()).toBe(0);
      expect(diagram.isEnabled).toBe(false);
      expect(overview().isEnabled).toBe(false);
      expect(controls().length).toBeGreaterThan(15);
      for (const control of controls()) expect(control.disabled).toBe(true);

      await drawFrames(performance.now() + 60_000);
      expect(bench.busy()).toBe(false);
      expect(visibleNodes()).toBe(24);
      expect(diagram.isEnabled).toBe(true);
      expect(overview().isEnabled).toBe(true);
      expect(controls().filter((control) => !control.disabled).length).toBeGreaterThan(15);
    });

    it('leaves the history empty and the initial state intact', async () => {
      bench.reset('fund-structure');
      await settle();
      await drawFrames(performance.now() + 60_000);
      expect(bench.stats()).toMatchObject({ nodes: 24, historyLength: 0, historyIndex: -1 });
      expect(bench.stateCheck()).toEqual({ label: INITIAL, ok: true });
    });

    it('starts over when other data is loaded while nodes are still appearing', async () => {
      bench.reset('fund-structure');
      await settle();
      bench.reset('100');
      await settle();
      expect(bench.busy()).toBe(true);
      expect(visibleNodes()).toBe(0);

      await drawFrames(performance.now() + 60_000);
      expect(bench.busy()).toBe(false);
      expect(bench.stats()).toMatchObject({ nodes: 100 });
      expect(visibleNodes()).toBe(100);
      expect(diagram.isEnabled).toBe(true);
    });
  });

  describe('undo and redo', () => {
    it('undoes everything back to the initial state and redoes it to the latest', async () => {
      await bench.randomizeAll();
      await bench.randomizeOne();
      await bench.changeLayout('circle');
      expect(bench.stats()).toMatchObject({ historyLength: 3, historyIndex: 2 });

      await bench.undoAll();
      expect(bench.stateCheck()).toEqual({ label: INITIAL, ok: true });
      expect(bench.layoutType()).toBe('top-bottom');

      await bench.redoAll();
      expect(bench.stateCheck()).toEqual({ label: LATEST, ok: true });
      expect(bench.layoutType()).toBe('circle');
    });

    it('steps one transaction at a time and says where it is', async () => {
      await bench.randomizeAll();
      await bench.randomizeAll();
      await bench.undo();
      expect(bench.stats()?.historyIndex).toBe(0);
      expect(bench.stateCheck().label).toBe('Transaction 1 of 2');
      await bench.redo();
      expect(bench.stats()?.historyIndex).toBe(1);
    });

    it('routes the keyboard shortcuts through the same timed operations', async () => {
      await bench.randomizeAll();
      diagram.commandHandler.undo();
      await bench.redo();
      expect(bench.log().map((entry) => entry.op)).toEqual(['Redo', 'Undo', 'Randomize all nodes']);
    });

    it('runs operations in the order they were asked for, losing none', async () => {
      await bench.randomizeAll();
      await bench.randomizeAll();
      await Promise.all([bench.undo(), bench.undo()]);
      expect(bench.stats()?.historyIndex).toBe(-1);
    });

    it('logs every operation with its number of transactions', async () => {
      bench.bulkRuns.set(4);
      await bench.runBulk();
      await bench.undoAll();
      expect(bench.log()[0]).toMatchObject({ op: 'Undo all', steps: 4 });
      expect(bench.log()[1]).toMatchObject({ op: '4 × randomize all nodes', steps: 4 });
    });
  });

  describe('bulk runs', () => {
    const type = (value: string): string => {
      const input = page.querySelector<HTMLInputElement>(
        'input[aria-label="Number of bulk transactions"]',
      )!;
      input.value = value;
      bench.setBulkRuns(input);
      return input.value;
    };

    it('allows as many runs as there are nodes', () => {
      expect(bench.maxBulkRuns()).toBe(30);
    });

    it('corrects entries that are not a whole number from 1 to the maximum', () => {
      expect(type('999999999')).toBe('30');
      expect(type('1e9')).toBe('30');
      expect(type('-5')).toBe('1');
      expect(type('0')).toBe('1');
      expect(type('')).toBe('1');
      expect(type('7.9')).toBe('7');
      expect(type('12')).toBe('12');
      expect(bench.bulkRuns()).toBe(12);
    });

    it('lowers a number that was typed for a bigger diagram', async () => {
      bench.bulkRuns.set(30);
      bench.reset('fund-structure');
      await settle();
      expect(bench.maxBulkRuns()).toBe(24);
      expect(bench.bulkRuns()).toBe(24);
    });
  });

  describe('editing nodes', () => {
    it('applies a change to every selected node as one undo step', async () => {
      await select(3, 7, 12);
      expect(bench.selected()).toMatchObject({ count: 3, title: null });

      await bench.editSelected('title', 'Batch title');
      expect([3, 7, 12].map((key) => nodeData(key).title)).toEqual(Array(3).fill('Batch title'));
      expect(nodeData(4).title).not.toBe('Batch title');
      expect(bench.stats()?.historyLength).toBe(1);
      expect(bench.selected()?.title).toBe('Batch title');
      expect(bench.log()[0].op).toBe('Set title on 3 nodes');
    });

    it('adds nothing to the history when the value is already there', async () => {
      await select(3);
      await bench.editSelected('color', nodeData(3).color);
      expect(bench.stats()?.historyLength).toBe(0);
    });

    it('colors a single node from its color icon', async () => {
      bench.showColorPicker(nodeData(5));
      await settle();
      expect(dialog('Color of').open).toBe(true);
      await bench.pickColor('#bfdbfe');
      expect(nodeData(5).color).toBe('#bfdbfe');
      expect(dialog('Color of')?.open ?? false).toBe(false);
    });

    it('adds a node as a gray rectangle with a key no relationship refers to', async () => {
      await bench.addNode();
      const added = nodeData(31);
      expect(added).toMatchObject({
        title: 'New fund 31',
        shape: DEFAULT_SHAPE,
        color: DEFAULT_COLOR,
      });
      expect(diagram.findNodeForKey(31)!.findLinksConnected().count).toBe(0);
      await bench.undo();
      expect(bench.stateCheck().ok).toBe(true);
    });
  });

  describe('comments', () => {
    const saveButton = () =>
      Array.from(dialog('Comment on').querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === 'Save',
      )!;

    it('cannot be saved while empty', async () => {
      bench.showComment(nodeData(2));
      await settle();
      expect(saveButton().disabled).toBe(true);

      const text = dialog('Comment on').querySelector('textarea')!;
      text.value = '   ';
      text.dispatchEvent(new Event('input'));
      await settle();
      expect(saveButton().disabled).toBe(true);

      text.value = 'Check this fund';
      text.dispatchEvent(new Event('input'));
      await settle();
      expect(saveButton().disabled).toBe(false);
    });

    it('are stored trimmed, as one undo step', async () => {
      bench.showComment(nodeData(2));
      await bench.saveComment('  Check this fund  ');
      expect(nodeData(2).comment).toBe('Check this fund');
      expect(bench.log()[0].op).toBe('Set comment on 1 node');
      await bench.undo();
      expect(nodeData(2).comment).toBe('');
    });
  });

  describe('deleting nodes', () => {
    it('asks first, and deletes nothing when cancelled', async () => {
      bench.askToDelete([nodeData(5)]);
      await settle();
      expect(dialog('Delete "').open).toBe(true);
      expect(bench.deleteRequest()).toMatchObject({ keys: [5], title: nodeData(5).title });

      bench.cancelDelete();
      await settle();
      expect(bench.stats()).toMatchObject({ nodes: 30, historyLength: 0 });
    });

    it('removes the node together with its relationships, and nothing else', async () => {
      const links = model().linkDataArray.length;
      const attached = diagram.findNodeForKey(5)!.findLinksConnected().count;
      expect(attached).toBeGreaterThan(0);
      bench.askToDelete([nodeData(5)]);
      expect(bench.deleteRequest()?.attached).toBe(attached);

      await bench.confirmDelete();
      expect(diagram.findNodeForKey(5)).toBeNull();
      expect(bench.stats()).toMatchObject({ nodes: 29, links: links - attached });
      // No relationship is left pointing at the deleted node, and none was created.
      expect(model().linkDataArray.some((link) => link.from === 5 || link.to === 5)).toBe(false);
      expect(bench.log()[0].op).toBe('Delete 1 node');

      await bench.undo();
      await settle();
      expect(diagram.findNodeForKey(5)!.findLinksConnected().count).toBe(attached);
      expect(bench.stateCheck().ok).toBe(true);
    });

    it('keeps the children of a deleted node in the diagram, without re-attaching them', async () => {
      const children = model()
        .linkDataArray.filter((link) => link.category === 'hierarchy' && link.from === 2)
        .map((link) => link.to);
      expect(children.length).toBeGreaterThan(0);
      bench.askToDelete([nodeData(2)]);
      await bench.confirmDelete();

      for (const child of children) {
        expect(model().findNodeDataForKey(child)).not.toBeNull();
        const parents = model().linkDataArray.filter(
          (link) => link.category === 'hierarchy' && link.to === child,
        );
        expect(parents).toEqual([]);
      }
    });

    it('asks about all selected nodes when Delete is pressed', async () => {
      await select(9, 10);
      void bench.deleteSelection();
      await settle();
      expect(bench.deleteRequest()?.keys).toEqual([9, 10]);
      expect(dialog('Delete 2 nodes').open).toBe(true);
      await bench.confirmDelete();
      expect(bench.stats()?.nodes).toBe(28);
    });

    it('gives a node added afterwards no relationships of the deleted one', async () => {
      bench.askToDelete([nodeData(30)]);
      await bench.confirmDelete();
      await bench.addNode();
      const added = model().nodeDataArray.at(-1)!;
      expect(added.title).toBe(`New fund ${added.key}`);
      expect(diagram.findNodeForKey(added.key)!.findLinksConnected().count).toBe(0);
    });
  });

  describe('relationships', () => {
    const anyLink = () => model().linkDataArray[4];

    it('are removed at once when only lines are selected', async () => {
      const links = model().linkDataArray.length;
      diagram.select(diagram.findLinkForData(anyLink())!);
      await settle();
      await bench.deleteSelection();
      expect(bench.stats()?.links).toBe(links - 1);
      expect(bench.deleteRequest()).toBeNull();
      expect(bench.log()[0].op).toBe('Remove 1 relationship');
    });

    it('can all be removed from the selected nodes', async () => {
      await select(5);
      const attached = diagram.findNodeForKey(5)!.findLinksConnected().count;
      const links = model().linkDataArray.length;
      await bench.removeLinksOfSelectedNodes();
      expect(bench.stats()?.links).toBe(links - attached);
      expect(diagram.findNodeForKey(5)!.findLinksConnected().count).toBe(0);
    });

    it('show their ownership in the info dialog, or that there is no data', async () => {
      const known = model().linkDataArray.find((link) => link.ownership !== undefined)!;
      const unknown = model().linkDataArray.find((link) => link.ownership === undefined)!;

      bench.showLinkInfo(known);
      expect(bench.linkInfo()?.ownership).toMatch(/^\d{1,3}\.\d{2}%$/);
      bench.showLinkInfo(unknown);
      await settle();
      expect(bench.linkInfo()?.ownership).toBeNull();
      expect(dialog('Relationship').textContent).toContain('No data');
    });

    it('can be removed from the info dialog', async () => {
      const link = anyLink();
      bench.showLinkInfo(link);
      await bench.removeInfoLink();
      expect(model().containsLinkData(link)).toBe(false);
    });
  });

  describe('layout and lines', () => {
    it('switches the layout as one undo step and keeps the dropdown in step', async () => {
      await bench.changeLayout('grid');
      expect(model().modelData.layoutType).toBe('grid');
      expect(bench.layoutType()).toBe('grid');
      expect(bench.log()[0].op).toBe('Layout: Grid');
      await bench.undo();
      expect(bench.layoutType()).toBe('top-bottom');
    });

    it('switches the line type as one undo step', async () => {
      await bench.changeLinkType('straight');
      expect(bench.linkType()).toBe('straight');
      expect(diagram.links.first()!.routing).toBe(go.Routing.Normal);
      await bench.undo();
      expect(bench.linkType()).toBe('avoid');
      expect(diagram.links.first()!.routing).toBe(go.Routing.AvoidsNodes);
    });

    it('leaves layout and line type to the tool strip: the header only has the data dropdown', () => {
      const headerLabels = Array.from(page.querySelectorAll('header label')).map(
        (label) => label.textContent?.trim().split(/\s+/)[0],
      );
      expect(headerLabels).toEqual(['Data']);
    });

    it('does nothing when asked for the layout it already has', async () => {
      await bench.changeLayout('top-bottom');
      expect(bench.stats()?.historyLength).toBe(0);
      expect(bench.log()).toEqual([]);
    });

    it('tidies moved nodes with Auto arrange, as one undo step', async () => {
      const before = nodeData(4).loc;
      model().commit((m) => m.set(nodeData(4), 'loc', '-900 -900'), 'move');
      await bench.autoArrange();
      expect(nodeData(4).loc).toBe(before);
      await bench.undo();
      expect(nodeData(4).loc).toBe('-900 -900');
    });
  });

  describe('tree highlight', () => {
    const dimmed = () => {
      let count = 0;
      diagram.nodes.each((node) => (count += node.opacity < 1 ? 1 : 0));
      return count;
    };

    it('dims the rest of the diagram while exactly one node is selected', async () => {
      await select(8);
      expect(dimmed()).toBeGreaterThan(0);
      expect(diagram.findNodeForKey(8)!.opacity).toBe(1);

      await select(8, 9);
      expect(dimmed()).toBe(0);
    });

    it('ends when the selection is cleared, on Zoom to fit and on any operation', async () => {
      await select(8);
      diagram.clearSelection();
      await settle();
      expect(dimmed()).toBe(0);

      await select(8);
      bench.zoomToFit();
      expect(dimmed()).toBe(0);

      diagram.clearSelection();
      await select(8);
      await bench.randomizeOne();
      expect(dimmed()).toBe(0);
    });

    it('never becomes part of the undo history', async () => {
      await select(8);
      diagram.clearSelection();
      await settle();
      expect(bench.stats()?.historyLength).toBe(0);
      expect(bench.stateCheck().ok).toBe(true);
    });
  });

  describe('styles by fund type', () => {
    const typeOf = (index: number) => bench.styleRows()[index].type;
    const nodesOfType = (type: string) =>
      model().nodeDataArray.filter((node) => node.subtitle === type);

    beforeEach(async () => {
      bench.openStyles();
      await settle();
    });

    it('lists every fund type in the diagram with its number of nodes', () => {
      const types = new Set(model().nodeDataArray.map((node) => node.subtitle));
      expect(bench.styleRows().map((row) => row.type)).toEqual([...types].sort());
      for (const row of bench.styleRows()) expect(row.count).toBe(nodesOfType(row.type).length);
      expect(dialog('Styles by fund type').open).toBe(true);
    });

    it('changes nothing until Apply is pressed', () => {
      bench.toggleStyleType(typeOf(0));
      bench.chooseStyle('color', '#bfdbfe');
      bench.chooseStyle('shape', 'Diamond');
      expect(bench.canApplyStyle()).toBe(true);
      expect(bench.stats()?.historyLength).toBe(0);
      for (const node of model().nodeDataArray) expect(node.color).toBe(DEFAULT_COLOR);
    });

    it('cannot apply without a fund type, or without a color or shape', () => {
      expect(bench.canApplyStyle()).toBe(false);
      bench.toggleStyleType(typeOf(0));
      expect(bench.canApplyStyle()).toBe(false);
      bench.chooseStyle('shape', 'Ellipse');
      expect(bench.canApplyStyle()).toBe(true);
      bench.toggleStyleType(typeOf(0));
      expect(bench.canApplyStyle()).toBe(false);
    });

    it('applies color and shape to every node of several fund types at once, and closes', async () => {
      const [first, second, other] = [typeOf(0), typeOf(1), typeOf(2)];
      bench.toggleStyleType(first);
      bench.toggleStyleType(second);
      bench.chooseStyle('color', '#bfdbfe');
      bench.chooseStyle('shape', 'Diamond');
      await bench.applyStyles();

      for (const node of [...nodesOfType(first), ...nodesOfType(second)]) {
        expect(node).toMatchObject({ color: '#bfdbfe', shape: 'Diamond' });
      }
      for (const node of nodesOfType(other)) expect(node.color).toBe(DEFAULT_COLOR);
      expect(bench.stats()?.historyLength).toBe(1);
      expect(dialog('Styles by fund type').open).toBe(false);

      await bench.undo();
      expect(bench.stateCheck().ok).toBe(true);
    });

    it('shows in the preview what Apply would do', () => {
      bench.toggleStyleType(typeOf(0));
      bench.chooseStyle('color', '#fde68a');
      expect(bench.nodePreview()).toMatchObject({ fill: '#fde68a', subtitle: typeOf(0) });
      bench.toggleStyleType(typeOf(1));
      expect(bench.nodePreview().subtitle).toBe('2 fund types');
    });

    it('takes a choice back when it is picked a second time', () => {
      bench.chooseStyle('shape', 'Capsule');
      bench.chooseStyle('shape', 'Capsule');
      expect(bench.styleDraft().shape).toBeNull();
    });

    it('selects and unselects all fund types at once', () => {
      bench.selectAllStyleTypes(true);
      expect(bench.allStyleTypesSelected()).toBe(true);
      expect(bench.styleTypes().size).toBe(bench.styleRows().length);
      bench.selectAllStyleTypes(false);
      expect(bench.styleTypes().size).toBe(0);
    });

    it('can undo a reset and then redo it', async () => {
      bench.selectAllStyleTypes(true);
      bench.chooseStyle('color', '#fecaca');
      bench.chooseStyle('shape', 'Ellipse');
      await bench.applyStyles();
      bench.askToResetStyles();
      await bench.confirmResetStyles();
      await settle();
      expect(nodeData(1)).toMatchObject({ color: DEFAULT_COLOR, shape: DEFAULT_SHAPE });

      await bench.undo();
      await settle();
      expect(nodeData(1)).toMatchObject({ color: '#fecaca', shape: 'Ellipse' });
      expect(bench.stats()).toMatchObject({ historyLength: 2, historyIndex: 0 });
      expect(diagram.model.undoManager.canRedo()).toBe(true);

      await bench.redo();
      await settle();
      expect(nodeData(1)).toMatchObject({ color: DEFAULT_COLOR, shape: DEFAULT_SHAPE });
      expect(bench.stats()).toMatchObject({ historyLength: 2, historyIndex: 1 });
    });

    it('can redo styles that were undone', async () => {
      bench.toggleStyleType(typeOf(0));
      bench.chooseStyle('shape', 'Diamond');
      await bench.applyStyles();
      await settle();
      await bench.undo();
      await settle();
      expect(diagram.model.undoManager.canRedo()).toBe(true);
      await bench.redo();
      await settle();
      expect(nodesOfType(typeOf(0))[0].shape).toBe('Diamond');
    });

    it('resets every node to a gray rectangle only after confirmation', async () => {
      bench.selectAllStyleTypes(true);
      bench.chooseStyle('color', '#fecaca');
      bench.chooseStyle('shape', 'Ellipse');
      await bench.applyStyles();

      bench.askToResetStyles();
      await settle();
      expect(dialog('Reset all styles').open).toBe(true);
      bench.cancelResetStyles();
      expect(nodeData(1).shape).toBe('Ellipse');

      bench.askToResetStyles();
      await bench.confirmResetStyles();
      for (const node of model().nodeDataArray) {
        expect(node).toMatchObject({ color: DEFAULT_COLOR, shape: DEFAULT_SHAPE });
      }
      expect(bench.styleTypes().size).toBe(0);
      expect(bench.log()[0].op).toBe('Reset styles');

      bench.openStyles();
      for (const row of bench.styleRows()) {
        expect(row).toMatchObject({ color: DEFAULT_COLOR, shape: DEFAULT_SHAPE });
      }
    });
  });

  describe('canvas tools', () => {
    const tool = (label: string) =>
      page.querySelector<HTMLButtonElement>(`nav.canvas-nav button[aria-label="${label}"]`)!;

    it('offers add node, undo, redo, the three zooms, layout and auto arrange, in that order', () => {
      const labels = Array.from(page.querySelectorAll('nav.canvas-nav button')).map((button) =>
        button.getAttribute('aria-label'),
      );
      expect(labels).toEqual([
        'Add node',
        'Undo',
        'Redo',
        'Zoom in',
        'Zoom out',
        'Zoom to fit',
        'Layout',
        'Lines',
        'Auto arrange',
      ]);
    });

    it('runs the current layout again from the last tool, and the header no longer offers that', async () => {
      const before = nodeData(4).loc;
      model().commit((m) => m.set(nodeData(4), 'loc', '-900 -900'), 'move');
      tool('Auto arrange').click();
      await settle();
      await bench.undo();
      await bench.redo();
      expect(nodeData(4).loc).toBe(before);

      const headerButtons = Array.from(page.querySelectorAll('header button')).map((button) =>
        button.textContent?.trim(),
      );
      expect(headerButtons).not.toContain('Auto arrange');
    });

    it('opens a row of layout icons that are named on hover, and switches to the one picked', async () => {
      tool('Layout').click();
      await settle();
      const choices = Array.from(page.querySelectorAll<HTMLButtonElement>('.nav-flyout button'));
      expect(choices.map((choice) => choice.title)).toEqual([
        'Top to bottom',
        'Bottom to top',
        'Circle',
        'Layered digraph',
        'Force-directed',
        'Grid',
      ]);
      expect(choices.find((choice) => choice.classList.contains('current'))?.title).toBe(
        'Top to bottom',
      );

      choices.find((choice) => choice.title === 'Circle')!.click();
      await settle();
      await bench.undoAll();
      await bench.redoAll();
      expect(bench.layoutType()).toBe('circle');
      expect(page.querySelector('.nav-flyout')).toBeNull();
      expect(tool('Layout').title).toBe('Layout: Circle');
    });

    it('zooms in and out', () => {
      const scale = diagram.scale;
      tool('Zoom in').click();
      expect(diagram.scale).toBeGreaterThan(scale);
      tool('Zoom out').click();
      tool('Zoom out').click();
      expect(diagram.scale).toBeLessThan(scale);
    });

    it('zooms to fit the whole diagram, and the header no longer offers that', () => {
      tool('Zoom in').click();
      tool('Zoom in').click();
      const zoomedIn = diagram.scale;
      tool('Zoom to fit').click();
      expect(diagram.scale).toBeLessThan(zoomedIn);

      const headerButtons = Array.from(page.querySelectorAll('header button')).map((button) =>
        button.textContent?.trim(),
      );
      expect(headerButtons).not.toContain('Zoom to fit');
    });

    it('disables zooming, layout and auto arrange while the diagram is empty', async () => {
      const needsNodes = ['Zoom in', 'Zoom out', 'Zoom to fit', 'Layout', 'Lines', 'Auto arrange'];
      for (const label of needsNodes) expect(tool(label).disabled).toBe(false);

      bench.askToDelete([...model().nodeDataArray]);
      await bench.confirmDelete();
      await settle();
      expect(bench.stats()?.nodes).toBe(0);
      for (const label of needsNodes) expect(tool(label).disabled).toBe(true);
      // What still makes sense on an empty diagram stays available.
      expect(tool('Add node').disabled).toBe(false);
      expect(tool('Undo').disabled).toBe(false);

      tool('Add node').click();
      await settle();
      await bench.undo();
      await bench.redo();
      await settle();
      for (const label of needsNodes) expect(tool(label).disabled).toBe(false);
    });

    it('opens a column of line type icons that are named on hover, and switches to the one picked', async () => {
      tool('Lines').click();
      await settle();
      const choices = Array.from(page.querySelectorAll<HTMLButtonElement>('.nav-flyout button'));
      expect(choices.map((choice) => choice.title)).toEqual([
        'Orthogonal, rounded',
        'Orthogonal, square',
        'Straight (crosses nodes)',
        'Curved (crosses nodes)',
      ]);

      choices.find((choice) => choice.title.startsWith('Straight'))!.click();
      await settle();
      await bench.undoAll();
      await bench.redoAll();
      expect(bench.linkType()).toBe('straight');
      expect(page.querySelector('.nav-flyout')).toBeNull();
      expect(tool('Lines').title).toBe('Lines: Straight (crosses nodes)');
    });

    it('shows only one column of icons at a time', async () => {
      tool('Layout').click();
      await settle();
      tool('Lines').click();
      await settle();
      expect(page.querySelectorAll('.nav-flyout')).toHaveLength(1);
      expect(page.querySelector('.nav-flyout')!.getAttribute('aria-label')).toBe('Line types');
    });

    it('adds a node', async () => {
      tool('Add node').click();
      await settle();
      await bench.undoAll();
      await bench.redoAll();
      expect(bench.stats()?.nodes).toBe(31);
    });

    it('enables undo and redo only when there is something to undo or redo', async () => {
      await settle();
      expect(tool('Undo').disabled).toBe(true);
      expect(tool('Redo').disabled).toBe(true);

      await bench.randomizeOne();
      await settle();
      expect(tool('Undo').disabled).toBe(false);

      await bench.undo();
      await settle();
      expect(tool('Undo').disabled).toBe(true);
      expect(tool('Redo').disabled).toBe(false);
    });
  });

  describe('header', () => {
    it('ends, at the right, with Styles, then Actions, then a reload icon that resets the diagram', async () => {
      const controls = Array.from(page.querySelectorAll<HTMLElement>('header .bar-end > *')).map(
        (control) => control.getAttribute('aria-label') ?? control.textContent?.trim(),
      );
      expect(controls).toEqual(['Styles', 'Actions', 'Reset diagram', 'New diagram']);

      const resetButton = page.querySelector<HTMLButtonElement>(
        'header button[aria-label="Reset diagram"]',
      )!;
      expect(resetButton.title).toBe('Reset diagram');
      expect(resetButton.textContent?.trim()).toBe('');
      expect(resetButton.querySelector('svg')).not.toBeNull();

      await bench.randomizeAll();
      resetButton.click();
      await settle();
      expect(bench.stats()).toMatchObject({ nodes: 30, historyLength: 0 });
      expect(bench.stateCheck().ok).toBe(true);
    });
  });

  describe('name and description', () => {
    const field = (label: string) =>
      page.querySelector<HTMLInputElement>(`.canvas-bar input[aria-label="${label}"]`)!;
    const type = async (label: string, value: string) => {
      field(label).value = value;
      field(label).dispatchEvent(new Event('change'));
      await settle();
      await bench.undo();
      await bench.redo();
      await settle();
    };

    it('start as the name of the loaded data and an empty description', async () => {
      await settle();
      expect(field('Diagram name').value).toBe('30 generated funds');
      expect(field('Description').value).toBe('');
    });

    it('are stored with the diagram, trimmed, each change as one undo step', async () => {
      await type('Diagram name', '  Meridian holdings  ');
      expect(model().modelData.name).toBe('Meridian holdings');
      expect(field('Diagram name').value).toBe('Meridian holdings');

      await type('Description', 'Ownership as of year end');
      expect(model().modelData.description).toBe('Ownership as of year end');
      expect(bench.stats()?.historyLength).toBe(2);
      expect(bench.log().some((entry) => entry.op === 'Rename diagram')).toBe(true);
      expect(bench.log().some((entry) => entry.op === 'Describe diagram')).toBe(true);
    });

    it('come back on undo', async () => {
      await type('Diagram name', 'Renamed');
      await bench.undo();
      await settle();
      expect(model().modelData.name).toBe('30 generated funds');
      expect(field('Diagram name').value).toBe('30 generated funds');
      expect(bench.stateCheck().ok).toBe(true);
    });

    it('follow the data that is loaded, and a new diagram is untitled', async () => {
      bench.reset('fund-structure');
      await settle();
      expect(field('Diagram name').value).toBe('Sample fund structure');

      page.querySelector<HTMLButtonElement>('header button[aria-label="New diagram"]')!.click();
      await settle();
      expect(field('Diagram name').value).toBe('Untitled diagram');
    });
  });

  describe('search', () => {
    const box = () => page.querySelector<HTMLInputElement>('.search input')!;
    const count = () => page.querySelector('.search-count')!.textContent!.trim();
    const step = (label: 'Previous result' | 'Next result') =>
      page.querySelector<HTMLButtonElement>(`.search button[aria-label="${label}"]`)!;
    const type = async (query: string) => {
      box().value = query;
      box().dispatchEvent(new Event('input'));
      await settle();
    };
    const titled = (query: string) =>
      model()
        .nodeDataArray.filter((node) => node.title.toLowerCase().includes(query.toLowerCase()))
        .map((node) => node.key);
    const marked = () => {
      const keys: number[] = [];
      diagram.nodes.each((node) => {
        if (node.findAdornment('Search')) keys.push(node.key as number);
      });
      return keys;
    };

    it('sits to the right of the description', () => {
      const order = Array.from(page.querySelectorAll('.canvas-bar > *')).map(
        (element) => element.getAttribute('aria-label') ?? element.getAttribute('role'),
      );
      expect(order).toEqual(['Diagram name', 'Description', 'search']);
    });

    it('counts the nodes whose name contains what is typed, whatever the case', async () => {
      // Every generated fund name starts with one of a few houses, so this finds several.
      const house = model().nodeDataArray[0].title.split(' ')[0];
      const expected = titled(house);
      expect(expected.length).toBeGreaterThan(1);

      await type(house.toUpperCase());
      expect(count()).toBe(`${expected.length} found`);
      expect(marked()).toEqual([]);
    });

    it('steps through the results, marking and showing one node at a time', async () => {
      const house = model().nodeDataArray[0].title.split(' ')[0];
      const expected = titled(house);
      await type(house);

      step('Next result').click();
      await settle();
      expect(count()).toBe(`1 of ${expected.length}`);
      expect(marked()).toEqual([expected[0]]);
      // Zoomed in to life size, with the whole node in view.
      expect(diagram.scale).toBeGreaterThanOrEqual(1);
      const first = diagram.findNodeForKey(expected[0])!;
      expect(diagram.viewportBounds.containsRect(first.actualBounds)).toBe(true);

      step('Next result').click();
      await settle();
      expect(count()).toBe(`2 of ${expected.length}`);
      expect(marked()).toEqual([expected[1]]);

      step('Previous result').click();
      step('Previous result').click();
      await settle();
      // Going back from the first result wraps round to the last.
      expect(count()).toBe(`${expected.length} of ${expected.length}`);
      expect(marked()).toEqual([expected.at(-1)]);
    });

    it('lets go of the result when another node is clicked', async () => {
      const house = model().nodeDataArray[0].title.split(' ')[0];
      const expected = titled(house);
      await type(house);
      step('Next result').click();
      await settle();
      expect(marked()).toEqual([expected[0]]);

      const other = model().nodeDataArray.find((node) => !expected.includes(node.key))!;
      await select(other.key);
      expect(marked()).toEqual([]);
      // The search itself stays: the count is back to the total, and stepping starts over.
      expect(count()).toBe(`${expected.length} found`);
      step('Next result').click();
      await settle();
      expect(count()).toBe(`1 of ${expected.length}`);
    });

    it('goes to the next result on Enter', async () => {
      const house = model().nodeDataArray[0].title.split(' ')[0];
      await type(house);
      box().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      await settle();
      expect(count()).toMatch(/^1 of /);
    });

    it('says when nothing is found, and then has nowhere to step to', async () => {
      await type('no such fund');
      expect(count()).toBe('No nodes found');
      expect(step('Next result').disabled).toBe(true);
      expect(step('Previous result').disabled).toBe(true);
    });

    it('clears the mark and the count when the box is emptied', async () => {
      await type(model().nodeDataArray[0].title.split(' ')[0]);
      step('Next result').click();
      await settle();
      await type('');
      expect(count()).toBe('');
      expect(marked()).toEqual([]);
    });

    it('is emptied when the diagram is reset, when other data is loaded and on a new diagram', async () => {
      const reload = page.querySelector<HTMLButtonElement>('button[aria-label="Reset diagram"]')!;
      const blank = page.querySelector<HTMLButtonElement>('button[aria-label="New diagram"]')!;
      const loads: (() => void)[] = [
        () => reload.click(),
        () => bench.reset('fund-structure'),
        () => blank.click(),
      ];
      for (const load of loads) {
        // A new diagram is empty, so the search before it runs on the sample funds.
        await type('fund');
        expect(count()).not.toBe('');
        step('Next result').click();
        await settle();

        load();
        await settle();
        expect(box().value).toBe('');
        expect(count()).toBe('');
        expect(marked()).toEqual([]);
        expect(step('Next result').disabled).toBe(true);
      }
    });

    it('follows renames: the count changes when a matching node is renamed', async () => {
      const house = model().nodeDataArray[0].title.split(' ')[0];
      const before = titled(house).length;
      await type(house);
      await select(titled(house)[0]);
      await bench.editSelected('title', 'Something else');
      await settle();
      expect(count()).toBe(`${before - 1} found`);
    });

    it('is display only: searching adds nothing to the undo history', async () => {
      await type(model().nodeDataArray[0].title.split(' ')[0]);
      step('Next result').click();
      await settle();
      expect(bench.stats()?.historyLength).toBe(0);
      expect(bench.stateCheck().ok).toBe(true);
    });
  });

  describe('overview', () => {
    const overview = () =>
      (fixture.componentInstance as unknown as { overview: go.Overview }).overview;

    it('shows the whole diagram in the bottom right corner of the canvas', () => {
      const host = page.querySelector<HTMLElement>('.diagram-area .overview')!;
      expect(host).not.toBeNull();
      expect(overview().div).toBe(host);
      expect(overview().observed).toBe(diagram);
    });

    it('stays with the diagram when other data is loaded', async () => {
      bench.reset('fund-structure');
      await settle();
      expect(overview().observed).toBe(diagram);
    });
  });

  describe('large diagrams', () => {
    it('are loaded with straight lines, because routing around nodes would take many seconds', async () => {
      expect(bench.linkType()).toBe('avoid');
      bench.reset('500');
      await settle();
      expect(bench.stats()?.nodes).toBe(500);
      expect(bench.linkType()).toBe('straight');
      expect(model().modelData.linkType).toBe('straight');
    }, 20_000);

    it('switch to orthogonal lines without routing them around the nodes, as one undo step', async () => {
      bench.reset('500');
      await settle();
      await bench.changeLinkType('avoid');
      await settle();
      expect(bench.linkType()).toBe('avoid');
      expect(bench.stats()).toMatchObject({ historyLength: 1 });
      diagram.links.each((link) => expect(link.routing).toBe(go.Routing.Orthogonal));

      await bench.undo();
      expect(bench.linkType()).toBe('straight');
      expect(bench.stateCheck()).toEqual({ label: INITIAL, ok: true });
    }, 20_000);

    it('say in the Lines menu that orthogonal lines cross nodes there', async () => {
      const titles = async () => {
        page.querySelector<HTMLButtonElement>('button[aria-label="Lines"]')!.click();
        await settle();
        const found = Array.from(
          page.querySelectorAll<HTMLButtonElement>('.nav-flyout button'),
        ).map((choice) => choice.title);
        page.querySelector<HTMLButtonElement>('button[aria-label="Lines"]')!.click();
        await settle();
        return found;
      };
      expect((await titles())[0]).toBe('Orthogonal, rounded');

      bench.reset('500');
      await settle();
      expect(await titles()).toEqual([
        'Orthogonal, rounded (crosses nodes on a diagram this big)',
        'Orthogonal, square (crosses nodes on a diagram this big)',
        'Straight (crosses nodes)',
        'Curved (crosses nodes)',
      ]);
    }, 20_000);

    it('keep node-avoiding lines below 500 nodes', async () => {
      bench.reset('100');
      await settle();
      expect(bench.linkType()).toBe('avoid');
    }, 20_000);
  });

  describe('new diagram', () => {
    const newButton = () =>
      page.querySelector<HTMLButtonElement>('header button[aria-label="New diagram"]')!;

    it('opens an empty diagram with an empty history', async () => {
      await bench.randomizeAll();
      newButton().click();
      await settle();
      expect(bench.busy()).toBe(false);
      expect(bench.datasetId()).toBe('blank');
      expect(bench.stats()).toMatchObject({ nodes: 0, links: 0, historyLength: 0 });
      expect(bench.stateCheck().ok).toBe(true);
      expect(bench.log()).toEqual([]);
    });

    it('can be built up from scratch: nodes, a relationship between them, and undo', async () => {
      newButton().click();
      await settle();
      await bench.addNode();
      await bench.addNode();
      expect(model().nodeDataArray.map((node) => node.key)).toEqual([1, 2]);

      const [first, second] = [diagram.findNodeForKey(1)!, diagram.findNodeForKey(2)!];
      expect(first.actualBounds.intersectsRect(second.actualBounds)).toBe(false);
      diagram.startTransaction('Linking');
      diagram.toolManager.linkingTool.insertLink(first, first.port, second, second.port);
      diagram.commitTransaction('Linking');
      await settle();
      expect(bench.stats()).toMatchObject({ nodes: 2, links: 1 });

      await bench.undo();
      await bench.undo();
      await bench.undo();
      expect(bench.stats()).toMatchObject({ nodes: 0, links: 0 });
      expect(bench.stateCheck().ok).toBe(true);
    });
  });

  describe('changes of an operation', () => {
    const number = () => page.querySelector<HTMLButtonElement>('.log tbody .link-button')!;
    const changes = () => dialog('Changes:');
    const rows = () =>
      Array.from(changes().querySelectorAll('tbody tr')).map((row) =>
        Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent!.trim()),
      );

    it('are listed when the number of changes in the statistics is clicked', async () => {
      await bench.randomizeOne();
      await settle();
      const recorded = bench.log()[0].changes;
      expect(number().textContent!.trim()).toBe(String(recorded));

      number().click();
      await settle();
      expect(changes().open).toBe(true);
      expect(changes().querySelector('h2')!.textContent).toBe('Changes: Randomize 1 node');
      expect(rows().length).toBe(recorded);
    });

    it('say that one randomized node is four changes to the data, the rest to the drawing', async () => {
      await bench.randomizeOne();
      await settle();
      number().click();
      await settle();

      const data = rows().filter((row) => row[1] === 'Data');
      expect(data.map((row) => row[3])).toEqual(['title', 'fund type', 'shape', 'color']);
      const drawing = rows().filter((row) => row[1] === 'Drawing');
      expect(drawing.length).toBe(bench.log()[0].changes - 4);
      // All of them belong to the one fund that was changed.
      expect(new Set(rows().map((row) => row[2])).size).toBe(1);
      const summary = changes().querySelector('.hint')!.textContent!.replace(/\s+/g, ' ');
      expect(summary).toContain('4 to the data');
      expect(summary).toContain(`${drawing.length} to the drawing`);
    });

    it('lists the first 200 changes of a big operation and counts the rest', async () => {
      await bench.randomizeAll();
      await settle();
      number().click();
      await settle();
      expect(rows().length).toBe(200);
      const groups = Array.from(changes().querySelectorAll('.change-groups li')).map((item) =>
        item.textContent!.replace(/\s+/g, ' ').trim(),
      );
      expect(groups.slice(0, 4).sort()).toEqual([
        'Data color × 30',
        'Data fund type × 30',
        'Data shape × 30',
        'Data title × 30',
      ]);
      expect(changes().textContent).toContain(`first 200 of ${bench.log()[0].changes} changes`);
    });

    it('still shows the changes of an operation after it was undone and replaced', async () => {
      await bench.randomizeOne();
      await bench.undo();
      await bench.randomizeAll();
      await settle();
      const first = Array.from(
        page.querySelectorAll<HTMLButtonElement>('.log tbody .link-button'),
      ).at(-1)!;
      first.click();
      await settle();
      expect(changes().querySelector('h2')!.textContent).toBe('Changes: Randomize 1 node');
      expect(rows().filter((row) => row[1] === 'Data').length).toBe(4);
    });

    it('closes again', async () => {
      await bench.randomizeOne();
      await settle();
      number().click();
      await settle();
      changes().querySelector<HTMLButtonElement>('.actions button')!.click();
      await settle();
      expect(page.querySelector('dialog.changes')!.hasAttribute('open')).toBe(false);
    });
  });

  describe('recovering from a failed action', () => {
    const notice = () => page.querySelector('.failure');
    const level = () => model().undoManager.transactionLevel;
    /** Makes the next change to the model fail halfway, the way an error inside GoJS would. */
    const failNextCommit = () =>
      vi.spyOn(model(), 'commit').mockImplementationOnce(() => {
        model().startTransaction('doomed');
        model().set(nodeData(1), 'title', 'half done');
        throw new RangeError('Maximum call stack size exceeded');
      });

    beforeEach(() => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => vi.restoreAllMocks());

    it('undoes the half-done changes, closes the transaction and says so', async () => {
      const title = nodeData(1).title;
      failNextCommit();
      await bench.randomizeAll();
      await settle();

      expect(level()).toBe(0);
      expect(nodeData(1).title).toBe(title);
      expect(bench.busy()).toBe(false);
      expect(bench.stats()).toMatchObject({ historyLength: 0 });
      expect(bench.stateCheck()).toEqual({ label: INITIAL, ok: true });
      expect(notice()!.textContent).toContain('could not be completed and was undone');
      expect(notice()!.getAttribute('role')).toBe('alert');
      expect(console.error).toHaveBeenCalled();
    });

    it('lets the user carry on: the next action, undo and redo all work', async () => {
      failNextCommit();
      await bench.randomizeAll();
      await bench.randomizeAll();
      await settle();
      expect(notice()).toBeNull();
      expect(bench.stats()).toMatchObject({ historyLength: 1, historyIndex: 0 });

      await bench.undo();
      expect(bench.stateCheck()).toEqual({ label: INITIAL, ok: true });
      await bench.redo();
      expect(bench.stateCheck()).toEqual({ label: LATEST, ok: true });
    });

    it('can be dismissed', async () => {
      failNextCommit();
      await bench.randomizeAll();
      await settle();
      notice()!.querySelector('button')!.click();
      await settle();
      expect(notice()).toBeNull();
    });

    it('closes a transaction that an earlier error left open before the next action', async () => {
      const title = nodeData(2).title;
      model().startTransaction('left open');
      model().set(nodeData(2), 'title', 'half done');

      await bench.randomizeOne();
      await settle();
      expect(level()).toBe(0);
      expect(bench.stats()).toMatchObject({ historyLength: 1 });
      await bench.undo();
      expect(nodeData(2).title).toBe(title);
      expect(bench.stateCheck()).toEqual({ label: INITIAL, ok: true });
    });

    it('can still load another diagram and reset while a transaction was left open', async () => {
      model().startTransaction('left open');
      bench.reset('fund-structure');
      await settle();
      expect(bench.stats()).toMatchObject({ nodes: 24, historyLength: 0 });
      expect(level()).toBe(0);
      expect(bench.busy()).toBe(false);
    });

    it('recovers from an error in the diagram itself, outside any action', async () => {
      const title = nodeData(3).title;
      model().startTransaction('left open');
      model().set(nodeData(3), 'title', 'half done');
      window.dispatchEvent(new ErrorEvent('error', { message: 'boom' }));
      await settle();
      expect(level()).toBe(0);
      expect(nodeData(3).title).toBe(title);
      expect(notice()).not.toBeNull();
    });

    it('leaves a drag or a text edit alone: their open transaction is not an error', async () => {
      const tool = diagram.toolManager.textEditingTool;
      diagram.currentTool = tool;
      model().startTransaction('tool at work');
      await bench.randomizeOne();
      expect(level()).toBe(1);
      expect(notice()).toBeNull();
      model().commitTransaction('tool at work');
      diagram.currentTool = diagram.defaultTool;
    });
  });

  describe('benchmark statistics', () => {
    const toggle = () => page.querySelector<HTMLButtonElement>('.log-toggle')!;
    const table = () => page.querySelector('.log table');

    afterEach(() => localStorage.clear());

    it('are open at first, under a heading that counts the operations', async () => {
      expect(table()).not.toBeNull();
      expect(toggle().getAttribute('aria-expanded')).toBe('true');
      expect(toggle().textContent).toContain('Benchmark statistics');
      expect(toggle().textContent).toContain('0 operations');
      await bench.randomizeOne();
      await settle();
      expect(toggle().textContent).toContain('1 operation');
      expect(table()!.querySelectorAll('tbody tr').length).toBe(1);
    });

    it('can be closed, which leaves only the heading, and opened again', async () => {
      toggle().click();
      await settle();
      expect(table()).toBeNull();
      expect(toggle().getAttribute('aria-expanded')).toBe('false');
      expect(page.querySelector('.log')!.classList.contains('closed')).toBe(true);

      toggle().click();
      await settle();
      expect(table()).not.toBeNull();
      expect(toggle().getAttribute('aria-expanded')).toBe('true');
    });

    it('keep recording while closed', async () => {
      toggle().click();
      await settle();
      await bench.randomizeOne();
      await settle();
      expect(toggle().textContent).toContain('1 operation');
      toggle().click();
      await settle();
      expect(table()!.querySelector('tbody td')!.textContent).toBe('Randomize 1 node');
    });

    it('stay closed the next time the page is opened', async () => {
      toggle().click();
      await settle();
      const again = TestBed.createComponent(PerfDiagram);
      again.detectChanges();
      await again.whenStable();
      expect((again.nativeElement as HTMLElement).querySelector('.log table')).toBeNull();
      again.destroy();
    });
  });

  describe('actions menu', () => {
    const menu = () => page.querySelector<HTMLSelectElement>('select[aria-label="Actions"]')!;
    const pick = (value: string) => {
      menu().value = value;
      menu().dispatchEvent(new Event('change'));
    };

    it('offers Save, Save As, Export PNG and Print, with only the last two enabled', () => {
      const options = Array.from(menu().options)
        .filter((option) => option.value !== '')
        .map((option) => [option.textContent?.trim(), option.disabled]);
      expect(options).toEqual([
        ['Save', true],
        ['Save As', true],
        ['Export PNG', false],
        ['Print', false],
      ]);
    });

    it('exports the whole diagram as a sharp PNG file, without selection marks or dimming', async () => {
      const downloads: string[] = [];
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
        this: HTMLAnchorElement,
      ) {
        downloads.push(this.download);
      });
      URL.createObjectURL ??= () => 'blob:test';
      URL.revokeObjectURL ??= () => undefined;
      const image = vi
        .spyOn(diagram, 'makeImageData')
        .mockImplementation(((options: { callback: (blob: Blob) => void }) =>
          options.callback(new Blob(['png']))) as never);
      // A selected node dims the rest of the diagram; the picture must not show that.
      await select(8);

      pick('export-png');

      const options = image.mock.calls[0][0] as go.ImageRendererOptions;
      expect(options.returnType).toBe('blob');
      // Twice the size of the diagram, so small text stays sharp.
      expect(options.scale).toBe(2);
      const drawn = new Set<go.Part>();
      (options.parts as go.List<go.Part>).each((part) => drawn.add(part));
      diagram.nodes.each((node) => expect(drawn.has(node)).toBe(true));
      diagram.links.each((link) => {
        expect(drawn.has(link)).toBe(true);
        expect(drawn.has(link.findAdornment('Info')!)).toBe(true);
      });
      const selectionMark = diagram.findNodeForKey(8)!.findAdornment('Selection')!;
      expect(drawn.has(selectionMark)).toBe(false);
      diagram.nodes.each((node) => expect(node.opacity).toBe(1));

      // The file is named after the diagram.
      expect(downloads).toEqual(['30 generated funds.png']);
      expect(menu().value).toBe('');
      click.mockRestore();
    });

    it('names the exported file after the diagram, replacing what a file name cannot contain', async () => {
      const downloads: string[] = [];
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
        this: HTMLAnchorElement,
      ) {
        downloads.push(this.download);
      });
      URL.createObjectURL ??= () => 'blob:test';
      URL.revokeObjectURL ??= () => undefined;
      vi.spyOn(diagram, 'makeImageData').mockImplementation(((options: {
        callback: (blob: Blob) => void;
      }) => options.callback(new Blob(['png']))) as never);
      const rename = async (name: string) => {
        const input = page.querySelector<HTMLInputElement>('.diagram-name')!;
        input.value = name;
        input.dispatchEvent(new Event('change'));
        await settle();
      };

      await rename('Meridian SICAV: structure 2026/Q3 "draft"?');
      pick('export-png');
      await rename('***');
      pick('export-png');

      expect(downloads).toEqual(['Meridian SICAV- structure 2026-Q3 -draft.png', 'diagram.png']);
      click.mockRestore();
    });

    it('prints a picture of the diagram', async () => {
      vi.spyOn(diagram, 'makeImageData').mockReturnValue('data:image/png;base64,AAAA' as never);
      const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);

      pick('print');
      await settle();
      const picture = page.querySelector<HTMLImageElement>('img.print-only')!;
      expect(picture.getAttribute('src')).toBe('data:image/png;base64,AAAA');

      picture.dispatchEvent(new Event('load'));
      await settle();
      expect(print).toHaveBeenCalledOnce();
      expect(page.querySelector('img.print-only')).toBeNull();
      print.mockRestore();
    });
  });

  describe('Add Batch', () => {
    it('opens the batch page for that node in a new tab', () => {
      const opened: { href: string; target: string }[] = [];
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
        this: HTMLAnchorElement,
      ) {
        opened.push({ href: this.getAttribute('href')!, target: this.target });
      });

      const icon = diagram.findNodeForKey(17)!.findObject('BATCH')!;
      diagram.lastInput.documentPoint = icon.getDocumentBounds().center;
      diagram.lastInput.control = false;
      diagram.toolManager.clickSelectingTool.standardMouseSelect();

      expect(opened).toEqual([{ href: '/batches/new?nodeId=17', target: '_blank' }]);
      expect(diagram.selection.count).toBe(0);
      click.mockRestore();
    });
  });
});
