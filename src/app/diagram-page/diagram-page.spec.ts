import { Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import * as go from 'gojs/release/go';
import { DEFAULT_COLOR, DEFAULT_SHAPE, DEVELOPER_TOOLS_KEY } from '../diagram/constants';
import { NodeModel } from '../diagram/diagram-factory';
import { LinkData, NodeData } from '../diagram/node-data';
import { BenchmarkStatistics } from './components/benchmark-statistics';
import { DiagramInfoBar } from './components/diagram-info-bar';
import { NodeDialogs } from './components/node-dialogs';
import { PageHeader } from './components/page-header';
import { RelationshipCard } from './components/relationship-card';
import { SidePanel } from './components/side-panel';
import { StylesDialog } from './components/styles-dialog';
import { ToolStrip } from './components/tool-strip';
import { DiagramActions } from './diagram-actions';
import { DiagramState } from './diagram-state';
import { LinkInfoCard } from './link-info-card';
import { OperationRunner } from './operation-runner';
import { DiagramPage } from './diagram-page';
import { SelectionState } from './selection-state';

/**
 * What these tests drive: members of the page, of its parts and of its services,
 * most of them not public. See `benchOf` for where each is found.
 */
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
  nodePreview(): { fill: string; subtitle: string | null };
  applyStyles(): Promise<void>;
  expandCards(): Promise<void>;
  collapseCards(): Promise<void>;
  askToResetStyles(): void;
  cancelResetStyles(): void;
  confirmResetStyles(): Promise<void>;
}

/** The child components of the page, and the services it provides, that the tests reach into. */
const PARTS: Type<unknown>[] = [
  PageHeader,
  DiagramInfoBar,
  ToolStrip,
  RelationshipCard,
  BenchmarkStatistics,
  SidePanel,
  NodeDialogs,
  StylesDialog,
];
const SERVICES: Type<unknown>[] = [DiagramActions, DiagramState, OperationRunner, SelectionState];

/**
 * The page with its parts and services as one object. These tests are about the
 * page as a whole, so they do not care which piece owns what they call: a member
 * is looked for in the page first, then in its parts, then in its services.
 */
function benchOf(fixture: ComponentFixture<DiagramPage>): Bench {
  const root = fixture.debugElement;
  const owners: object[] = [
    fixture.componentInstance,
    ...PARTS.map((part) => root.query(By.directive(part)).componentInstance as object),
    ...SERVICES.map((service) => root.injector.get(service) as object),
  ];
  return new Proxy({} as Bench, {
    get(_, name) {
      const owner = owners.find((candidate) => name in candidate);
      if (!owner) throw new Error(`Nothing on the page is called ${String(name)}`);
      const value = (owner as Record<PropertyKey, unknown>)[name];
      // A method needs its owner as `this`; a signal is a function too, but stands on its own.
      const isMethod = typeof value === 'function' && !Object.hasOwn(owner, name);
      return isMethod ? (value as (...args: unknown[]) => unknown).bind(owner) : value;
    },
  });
}

const INITIAL = 'Initial state: matches the startup snapshot';
const LATEST = 'Latest state: matches the snapshot taken before undo';

describe('DiagramPage', () => {
  let fixture: ComponentFixture<DiagramPage>;
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
    // The percentages were placed in the meantime; in a browser the next frame draws them.
    diagram.maybeUpdate();
  };
  /** What a click on the info icon of a relationship does. */
  const showLinkInfo = (link: LinkData) =>
    fixture.debugElement.injector.get(LinkInfoCard).show(link);
  const select = async (...keys: number[]) => {
    diagram.selectCollection(keys.map((key) => diagram.findNodeForKey(key)!));
    await settle();
  };

  beforeEach(async () => {
    // Most tests look at the statistics or the history numbers, so they have the developer
    // tools shown, as if that had been chosen on an earlier visit.
    localStorage.setItem(DEVELOPER_TOOLS_KEY, 'true');
    TestBed.configureTestingModule({ imports: [DiagramPage] });
    fixture = TestBed.createComponent(DiagramPage);
    fixture.detectChanges();
    await fixture.whenStable();
    bench = benchOf(fixture);
    diagram = bench.diagram;
    page = fixture.nativeElement as HTMLElement;
    // jsdom gives the canvas no size; this is how GoJS is told the size of the view without one.
    diagram.viewSize = new go.Size(1000, 700);
    await settle();
  });

  afterEach(() => localStorage.clear());

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

    it('leaves the diagram usable when the first action after loading is undone', async () => {
      const onScreen = (visible: boolean) =>
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => !visible });
      /** Loads with the animation, then goes on without waiting for frames after each action. */
      const loadAndReveal = async (dataset: string) => {
        onScreen(true);
        bench.reset(dataset);
        await settle();
        await drawFrames(performance.now() + 60_000);
        onScreen(false);
      };

      await loadAndReveal('fund-structure');
      expect(diagram.isEnabled).toBe(true);
      await bench.randomizeAll();
      await bench.undo();
      // Undo must not switch the diagram off again, as the loading animation had it.
      expect(diagram.isEnabled).toBe(true);
      expect(bench.stateCheck()).toEqual({ label: INITIAL, ok: true });
      await bench.redo();
      expect(diagram.isEnabled).toBe(true);

      // And the same after other data was loaded in the middle of an animation.
      onScreen(true);
      bench.reset('30');
      await settle();
      await loadAndReveal('fund-structure');
      await bench.randomizeOne();
      await bench.undo();
      expect(diagram.isEnabled).toBe(true);
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

  describe('random edits', () => {
    const places = () => {
      const found = new Map<number, string>();
      diagram.nodes.each((node) => found.set(node.key as number, node.location.toString()));
      return found;
    };
    const moved = (before: Map<number, string>) =>
      [...places()].filter(([key, place]) => before.get(key) !== place).length;

    it('Randomize all changes every node and switches to another layout, as one undo step', async () => {
      const before = places();
      await bench.randomizeAll();
      await settle();
      expect(bench.layoutType()).not.toBe('top-bottom');
      expect(model().modelData.layoutType).toBe(bench.layoutType());
      // Every node has a new place, except perhaps the one a layout happens to leave where it was.
      expect(moved(before)).toBeGreaterThanOrEqual(28);
      expect(bench.stats()?.historyLength).toBe(1);
      // The tool strip shows the layout that was picked.
      const layoutTool = page.querySelector<HTMLButtonElement>('button[aria-label="Layout"]')!;
      expect(layoutTool.dataset['tip']).not.toBe('Layout: Top to bottom');

      await bench.undo();
      await settle();
      expect(bench.layoutType()).toBe('top-bottom');
      expect(moved(before)).toBe(0);
      expect(bench.stateCheck()).toEqual({ label: INITIAL, ok: true });
      expect(layoutTool.dataset['tip']).toBe('Layout: Top to bottom');
    });

    it('the bulk edit moves the nodes a little instead, and keeps the layout', async () => {
      const start = new Map<number, go.Point>();
      diagram.nodes.each((node) => start.set(node.key as number, node.location.copy()));
      bench.bulkRuns.set(10);
      await bench.runBulk();
      await settle();
      diagram.nodes.each((node) => {
        const from = start.get(node.key as number)!;
        expect(Math.abs(node.location.x - from.x)).toBeLessThanOrEqual(15);
        expect(Math.abs(node.location.y - from.y)).toBeLessThanOrEqual(15);
      });
      expect(bench.layoutType()).toBe('top-bottom');
      await bench.undoAll();
      await settle();
      expect(bench.stateCheck()).toEqual({ label: INITIAL, ok: true });
    });

    it('Randomize 1 node changes one node, moves none and keeps the layout', async () => {
      const before = places();
      await bench.randomizeOne();
      await settle();
      expect(moved(before)).toBe(0);
      expect(bench.layoutType()).toBe('top-bottom');
    });

    it('says in the panel what the two do beyond the four fields', () => {
      const hint = page.querySelector('.side .hint')!.textContent!.replace(/\s+/g, ' ');
      expect(hint).toContain('switches to another layout');
      expect(hint).toContain('moves it a little');
    });
  });

  describe('undo and redo', () => {
    it('undoes everything back to the initial state and redoes it to the latest', async () => {
      await bench.randomizeAll();
      await bench.randomizeOne();
      // Randomize all picked a layout of its own; this is another one, whichever that was.
      const last = bench.layoutType() === 'circle' ? 'grid' : 'circle';
      await bench.changeLayout(last);
      expect(bench.stats()).toMatchObject({ historyLength: 3, historyIndex: 2 });

      await bench.undoAll();
      expect(bench.stateCheck()).toEqual({ label: INITIAL, ok: true });
      expect(bench.layoutType()).toBe('top-bottom');

      await bench.redoAll();
      expect(bench.stateCheck()).toEqual({ label: LATEST, ok: true });
      expect(bench.layoutType()).toBe(last);
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

    it('allows as many runs as there are nodes, and suggests that many at first', () => {
      expect(bench.maxBulkRuns()).toBe(30);
      // 50 would be suggested, but this diagram allows 30.
      expect(bench.bulkRuns()).toBe(30);
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

    describe('info card', () => {
      const card = () => page.querySelector<HTMLElement>('.diagram-area .link-card');
      const field = (name: string): string => {
        const terms = Array.from(card()!.querySelectorAll('dt'));
        return terms
          .find((term) => term.textContent === name)!
          .nextElementSibling!.textContent!.trim();
      };
      const open = async (link: LinkData) => {
        showLinkInfo(link);
        await settle();
      };
      /** Where the info icon of that relationship is on the canvas, in pixels. */
      const iconAt = (link: LinkData) =>
        diagram.transformDocToView(diagram.findLinkForData(link)!.midPoint);

      it('shows the data of the relationship on the canvas, without opening a dialog', async () => {
        const link = model().linkDataArray.find((candidate) => candidate.category === 'hierarchy')!;
        expect(card()).toBeNull();
        await open(link);

        expect(card()).not.toBeNull();
        expect(card()!.querySelector('h2')!.textContent).toBe(`Relationship ${link.key}`);
        expect(field('Type')).toBe('Hierarchy (parent to child)');
        expect(field('From')).toBe(`${nodeData(link.from).title} (node ${link.from})`);
        expect(field('To')).toBe(`${nodeData(link.to).title} (node ${link.to})`);
        for (const element of Array.from(page.querySelectorAll('dialog'))) {
          expect(element.hasAttribute('open')).toBe(false);
        }
      });

      it('shows the ownership, or that there is no data', async () => {
        await open(model().linkDataArray.find((link) => link.ownership !== undefined)!);
        expect(field('Ownership')).toMatch(/^\d{1,3}\.\d{2}%$/);
        await open(model().linkDataArray.find((link) => link.ownership === undefined)!);
        expect(field('Ownership')).toBe('No data');
      });

      it('stands beside the info icon that was clicked, inside the canvas', async () => {
        for (const link of model().linkDataArray) {
          await open(link);
          const icon = iconAt(link);
          const left = parseFloat(card()!.style.left);
          const top = parseFloat(card()!.style.top);
          // Inside the canvas, which is 1000 by 700 here; the card is 270 wide.
          expect(left).toBeGreaterThanOrEqual(8);
          expect(left + 270).toBeLessThanOrEqual(1000 - 8);
          expect(top).toBeGreaterThanOrEqual(8);
          expect(top + 178).toBeLessThanOrEqual(700 - 8);
          // Beside the icon, not on top of it, wherever the canvas leaves room for that.
          const onTheRight = Math.abs(left - (icon.x + 14)) <= 1;
          const onTheLeft = Math.abs(left + 270 - (icon.x - 14)) <= 1;
          const atTheEdge = left === 8 || left + 270 === 1000 - 8;
          expect(onTheRight || onTheLeft || atTheEdge).toBe(true);
        }
      });

      it('moves to another relationship when its icon is clicked', async () => {
        const [first, second] = model().linkDataArray;
        await open(first);
        await open(second);
        expect(page.querySelectorAll('.link-card')).toHaveLength(1);
        expect(card()!.querySelector('h2')!.textContent).toBe(`Relationship ${second.key}`);
      });

      it('goes away on a second click on the same icon, on its x and on Escape', async () => {
        const link = anyLink();
        await open(link);
        await open(link);
        expect(card()).toBeNull();

        await open(link);
        card()!.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!.click();
        await settle();
        expect(card()).toBeNull();

        await open(link);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        await settle();
        expect(card()).toBeNull();
      });

      it('goes away on a click on empty canvas and when a node is selected', async () => {
        const link = anyLink();
        await open(link);
        diagram.raiseDiagramEvent('BackgroundSingleClicked');
        await settle();
        expect(card()).toBeNull();

        await open(link);
        await select(3);
        expect(card()).toBeNull();
      });

      it('goes away when an action runs and when other data is loaded', async () => {
        const link = anyLink();
        await open(link);
        await bench.randomizeOne();
        await settle();
        expect(card()).toBeNull();

        await open(model().linkDataArray[0]);
        bench.reset('fund-structure');
        await settle();
        expect(card()).toBeNull();
      });

      it('follows its icon when the diagram is scrolled', async () => {
        // At life size the diagram is bigger than the canvas, so it can be scrolled.
        diagram.scale = 1;
        await settle();
        // A relationship in the middle of the diagram, brought to the middle of the canvas.
        const middle = diagram.documentBounds.center;
        const link = [...model().linkDataArray].sort((a, b) => {
          const distance = (candidate: LinkData) =>
            diagram.findLinkForData(candidate)!.midPoint.distanceSquaredPoint(middle);
          return distance(a) - distance(b);
        })[0];
        const icon = diagram.findLinkForData(link)!.midPoint;
        diagram.centerRect(new go.Rect(icon.x, icon.y, 1, 1));
        await settle();
        await open(link);
        const before = { left: parseFloat(card()!.style.left), top: parseFloat(card()!.style.top) };
        const from = diagram.position.copy();
        diagram.position = new go.Point(from.x + 60, from.y + 40);
        await settle();
        const moved = { x: diagram.position.x - from.x, y: diagram.position.y - from.y };
        expect(moved.x).toBeGreaterThan(0);
        expect(parseFloat(card()!.style.left)).toBeCloseTo(before.left - moved.x, 0);
        expect(parseFloat(card()!.style.top)).toBeCloseTo(before.top - moved.y, 0);
      });

      it('removes the relationship from its button, as one undo step, and closes', async () => {
        const link = anyLink();
        await open(link);
        const remove = Array.from(card()!.querySelectorAll('button')).find((button) =>
          button.textContent!.includes('Remove relationship'),
        )!;
        remove.click();
        await settle();
        await bench.undoAll();
        await bench.redoAll();
        expect(model().containsLinkData(link)).toBe(false);
        expect(bench.stats()).toMatchObject({ historyLength: 1 });
        expect(card()).toBeNull();
      });

      it('goes away when its relationship is deleted in another way', async () => {
        const link = anyLink();
        await open(link);
        diagram.commit(() => model().removeLinkData(link), 'delete');
        await settle();
        expect(card()).toBeNull();
      });
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

  describe('styles by legal entity field', () => {
    const typeOf = (index: number) => bench.styleRows()[index].type;
    const nodesOfType = (type: string) =>
      model().nodeDataArray.filter((node) => node.legalEntityType === type);
    const styles = () => dialog('Styles by legal entity field');
    const fieldSelect = () => styles().querySelector<HTMLSelectElement>('select.style-field')!;
    const listed = () =>
      Array.from(styles().querySelectorAll('.types .name')).map((name) => name.textContent!.trim());
    const pickField = async (value: string) => {
      fieldSelect().value = value;
      fieldSelect().dispatchEvent(new Event('change'));
      await settle();
    };

    beforeEach(async () => {
      bench.openStyles();
      await settle();
    });

    describe('choosing the field', () => {
      it('is titled "Styles by legal entity field"', () => {
        expect(styles().open).toBe(true);
        expect(styles().querySelector('h2')!.textContent).toBe('Styles by legal entity field');
      });

      it('offers one field for now, "Legal entity type", in a dropdown above Select all', async () => {
        // "Select a field" is what the closed dropdown says; the opened list offers the field only.
        expect(fieldSelect().value).toBe('');
        expect(fieldSelect().selectedOptions[0].textContent!.trim()).toBe('Select a field');
        const placeholder = fieldSelect().options[0];
        expect(placeholder.hidden).toBe(true);
        expect(placeholder.disabled).toBe(true);
        const offered = Array.from(fieldSelect().options).filter(
          (option) => !option.hidden && !option.disabled,
        );
        expect(offered.map((option) => option.textContent!.trim())).toEqual(['Legal entity type']);

        await pickField('legalEntityType');
        const selectAll = styles().querySelector('.pick-all')!;
        // The dropdown comes before the checkbox in the dialog.
        expect(
          fieldSelect().compareDocumentPosition(selectAll) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
      });

      it('shows no list, and no Select all, until a field is chosen', () => {
        expect(listed()).toEqual([]);
        expect(styles().querySelector('.pick-all')).toBeNull();
        expect(bench.canApplyStyle()).toBe(false);
        expect(styles().textContent).toContain('Select a legal entity field');
      });

      it('lists the legal entity types of the diagram once "Legal entity type" is chosen', async () => {
        await pickField('legalEntityType');
        const types = [
          ...new Set(model().nodeDataArray.map((node) => node.legalEntityType)),
        ].sort();
        expect(listed()).toEqual(types);
        expect(listed()).toContain('Fund of funds');
        expect(listed()).toContain('Feeder fund');
        expect(styles().querySelector('.pick-all')).not.toBeNull();
      });

      it('opens on the field the nodes show: none before Apply, the applied one after', async () => {
        await pickField('legalEntityType');
        // Closed without Apply: nothing was chosen for the diagram.
        styles().close();
        bench.openStyles();
        await settle();
        expect(fieldSelect().value).toBe('');
        expect(listed()).toEqual([]);

        await pickField('legalEntityType');
        await bench.applyStyles();
        bench.openStyles();
        await settle();
        expect(fieldSelect().value).toBe('legalEntityType');
        expect(listed().length).toBeGreaterThan(0);
      });
    });

    describe('the subtitle of the nodes', () => {
      /** How many nodes show a line of text under their name. */
      const withSubtitle = () => {
        let count = 0;
        diagram.nodes.each((node) => {
          const subtitle = (node.elt(2) as go.Panel).elt(1) as go.TextBlock;
          if (subtitle.visible) count++;
        });
        return count;
      };
      const subtitleOf = (key: number) =>
        ((diagram.findNodeForKey(key)!.elt(2) as go.Panel).elt(1) as go.TextBlock).text;

      it('is not shown at first: a node shows its name only', () => {
        expect(model().modelData.subtitleField).toBeNull();
        expect(withSubtitle()).toBe(0);
      });

      it('is shown on every node once a field is chosen and applied, without any style', async () => {
        await pickField('legalEntityType');
        // Nothing ticked, no color, no shape: the field alone can be applied.
        expect(bench.styleTypes().size).toBe(0);
        expect(bench.canApplyStyle()).toBe(true);
        expect(withSubtitle()).toBe(0);

        await bench.applyStyles();
        await settle();
        expect(styles().open).toBe(false);
        expect(withSubtitle()).toBe(30);
        expect(subtitleOf(1)).toBe(nodeData(1).legalEntityType);
        expect(subtitleOf(1)).toBe('Fund of funds');
        for (const node of model().nodeDataArray) {
          expect(node).toMatchObject({ color: DEFAULT_COLOR, shape: DEFAULT_SHAPE });
        }
        expect(bench.stats()).toMatchObject({ historyLength: 1 });
        expect(bench.log()[0].op).toBe('Show legal entity type on nodes');
      });

      it('goes away again on undo, and comes back on redo', async () => {
        await pickField('legalEntityType');
        await bench.applyStyles();
        await bench.undo();
        await settle();
        expect(withSubtitle()).toBe(0);
        expect(bench.stateCheck()).toEqual({ label: INITIAL, ok: true });
        await bench.redo();
        await settle();
        expect(withSubtitle()).toBe(30);
      });

      it('can be shown together with a color and a shape, in one undo step', async () => {
        await pickField('legalEntityType');
        const type = typeOf(0);
        bench.toggleStyleType(type);
        bench.chooseStyle('color', '#bfdbfe');
        bench.chooseStyle('shape', 'Diamond');
        await bench.applyStyles();
        await settle();

        expect(withSubtitle()).toBe(30);
        for (const node of nodesOfType(type)) {
          expect(node).toMatchObject({ color: '#bfdbfe', shape: 'Diamond' });
        }
        expect(bench.stats()).toMatchObject({ historyLength: 1 });

        await bench.undo();
        await settle();
        expect(withSubtitle()).toBe(0);
        for (const node of nodesOfType(type)) expect(node.color).toBe(DEFAULT_COLOR);
      });

      it('leaves Apply disabled when the field is shown already and no style is picked', async () => {
        await pickField('legalEntityType');
        await bench.applyStyles();
        bench.openStyles();
        await settle();
        expect(bench.canApplyStyle()).toBe(false);
        bench.toggleStyleType(typeOf(0));
        expect(bench.canApplyStyle()).toBe(false);
        bench.chooseStyle('shape', 'Ellipse');
        expect(bench.canApplyStyle()).toBe(true);
      });

      it('is in the preview only while a field is chosen', async () => {
        expect(bench.nodePreview().subtitle).toBeNull();
        expect(
          styles().querySelector('.node-preview-text span:not(.node-preview-icons)'),
        ).toBeNull();
        await pickField('legalEntityType');
        expect(bench.nodePreview().subtitle).toBe('Legal entity type');
      });

      it('is taken off the nodes by Reset all, which unselects the field as well', async () => {
        await pickField('legalEntityType');
        const type = typeOf(0);
        bench.toggleStyleType(type);
        bench.chooseStyle('color', '#fecaca');
        await bench.applyStyles();
        await settle();
        expect(withSubtitle()).toBe(30);

        bench.openStyles();
        await settle();
        bench.askToResetStyles();
        await bench.confirmResetStyles();
        await settle();
        expect(model().modelData.subtitleField).toBeNull();
        expect(withSubtitle()).toBe(0);
        for (const node of model().nodeDataArray) expect(node.color).toBe(DEFAULT_COLOR);
        // One undo step for both, on top of the one that applied them.
        expect(bench.stats()).toMatchObject({ historyLength: 2 });

        bench.openStyles();
        await settle();
        expect(fieldSelect().value).toBe('');
        expect(listed()).toEqual([]);
        styles().close();

        // One undo brings back the field and the colors together.
        await bench.undo();
        await settle();
        expect(withSubtitle()).toBe(30);
        for (const node of nodesOfType(type)) expect(node.color).toBe('#fecaca');
      });

      it('is unselected by Reset all also when only the field was applied', async () => {
        await pickField('legalEntityType');
        await bench.applyStyles();
        bench.openStyles();
        await settle();
        bench.askToResetStyles();
        await bench.confirmResetStyles();
        await settle();
        expect(withSubtitle()).toBe(0);
        expect(bench.log()[0].op).toBe('Reset styles');
        expect(bench.stateCheck().ok).not.toBe(false);
      });

      it('is unselected in the dialog by Reset all even when it was chosen but not applied', async () => {
        await pickField('legalEntityType');
        bench.askToResetStyles();
        await bench.confirmResetStyles();
        await settle();
        expect(bench.styleTypes().size).toBe(0);
        bench.openStyles();
        await settle();
        expect(fieldSelect().value).toBe('');
        // Nothing had been applied, so there was nothing to reset and nothing to undo.
        expect(bench.stats()).toMatchObject({ historyLength: 0 });
      });

      it('is hidden again in a newly loaded diagram', async () => {
        await pickField('legalEntityType');
        await bench.applyStyles();
        bench.reset('fund-structure');
        await settle();
        expect(model().modelData.subtitleField).toBeNull();
        expect(withSubtitle()).toBe(0);
      });
    });

    describe('with "Legal entity type" chosen', () => {
      beforeEach(async () => {
        await pickField('legalEntityType');
      });

      it('lists every legal entity type in the diagram with its number of nodes', () => {
        const types = new Set(model().nodeDataArray.map((node) => node.legalEntityType));
        expect(bench.styleRows().map((row) => row.type)).toEqual([...types].sort());
        for (const row of bench.styleRows()) expect(row.count).toBe(nodesOfType(row.type).length);
        expect(styles().open).toBe(true);
      });

      it('changes nothing until Apply is pressed', () => {
        bench.toggleStyleType(typeOf(0));
        bench.chooseStyle('color', '#bfdbfe');
        bench.chooseStyle('shape', 'Diamond');
        expect(bench.canApplyStyle()).toBe(true);
        expect(bench.stats()?.historyLength).toBe(0);
        for (const node of model().nodeDataArray) expect(node.color).toBe(DEFAULT_COLOR);
      });

      it('can be applied as soon as the field is chosen, also with nothing ticked or picked', () => {
        // The nodes do not show the field yet, so applying it alone is something to do.
        expect(bench.canApplyStyle()).toBe(true);
        bench.toggleStyleType(typeOf(0));
        bench.chooseStyle('shape', 'Ellipse');
        expect(bench.canApplyStyle()).toBe(true);
      });

      it('applies color and shape to every node of several legal entity types at once, and closes', async () => {
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
        expect(styles().open).toBe(false);

        await bench.undo();
        expect(bench.stateCheck().ok).toBe(true);
      });

      it('shows in the preview what Apply would do', () => {
        bench.toggleStyleType(typeOf(0));
        bench.chooseStyle('color', '#fde68a');
        expect(bench.nodePreview()).toMatchObject({ fill: '#fde68a', subtitle: typeOf(0) });
        bench.toggleStyleType(typeOf(1));
        expect(bench.nodePreview().subtitle).toBe('2 legal entity types');
      });

      it('takes a choice back when it is picked a second time', () => {
        bench.toggleStyleType(typeOf(0));
        bench.chooseStyle('shape', 'Capsule');
        expect(bench.styleDraft().shape).toBe('Capsule');
        bench.chooseStyle('shape', 'Capsule');
        expect(bench.styleDraft().shape).toBeNull();
      });

      it('offers color and shape only once a value of the field is ticked', async () => {
        const controls = () =>
          Array.from(
            styles().querySelectorAll<HTMLButtonElement | HTMLInputElement>(
              '.swatches button, .swatches input, .shape-tiles button',
            ),
          );
        expect(controls().length).toBeGreaterThan(10);
        for (const control of controls()) expect(control.disabled).toBe(true);
        // Picking one anyway does nothing.
        bench.chooseStyle('color', '#bfdbfe');
        expect(bench.styleDraft()).toEqual({ color: null, shape: null });

        bench.toggleStyleType(typeOf(0));
        await settle();
        for (const control of controls()) expect(control.disabled).toBe(false);
        bench.chooseStyle('color', '#bfdbfe');
        expect(bench.styleDraft().color).toBe('#bfdbfe');

        // Unticking the value disables them again and forgets what was picked.
        bench.toggleStyleType(typeOf(0));
        await settle();
        for (const control of controls()) expect(control.disabled).toBe(true);
        expect(bench.styleDraft()).toEqual({ color: null, shape: null });
      });

      it('offers neither color nor shape while no field is chosen', async () => {
        bench.askToResetStyles();
        await bench.confirmResetStyles();
        bench.openStyles();
        await settle();
        const disabled = Array.from(
          styles().querySelectorAll<HTMLButtonElement>('.swatches button, .shape-tiles button'),
        ).map((control) => control.disabled);
        expect(disabled.every(Boolean)).toBe(true);
      });

      it('selects and unselects all legal entity types at once', () => {
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
  });

  describe('canvas tools', () => {
    const tool = (label: string) =>
      page.querySelector<HTMLButtonElement>(`nav.canvas-nav button[aria-label="${label}"]`)!;

    it('offers its twelve tools in a fixed order, with expand all and collapse all at the bottom', () => {
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
        'Shape',
        'Auto arrange',
        'Expand all',
        'Collapse all',
      ]);
    });

    it('names every tool on hover', () => {
      const tips = Array.from(page.querySelectorAll<HTMLElement>('nav.canvas-nav button')).map(
        (button) => button.dataset['tip'],
      );
      expect(tips).toEqual([
        'Add node',
        'Undo',
        'Redo',
        'Zoom in',
        'Zoom out',
        'Zoom to fit',
        'Layout: Top to bottom',
        'Lines: Orthogonal, rounded',
        'Shape: select nodes first',
        'Auto arrange: run the current layout again',
        'Expand all: show the card of every relationship',
        'Collapse all: hide the relationship cards',
      ]);
    });

    describe('expand all and collapse all without relationships', () => {
      const tool = (label: 'Expand all' | 'Collapse all') =>
        page.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
      const bothDisabled = () => tool('Expand all').disabled && tool('Collapse all').disabled;

      it('are offered on a diagram whose nodes are joined', () => {
        expect(tool('Expand all').disabled).toBe(false);
        expect(tool('Expand all').dataset['tip']).toBe(
          'Expand all: show the card of every relationship',
        );
        // Nothing is expanded yet, so there is nothing to collapse.
        expect(tool('Collapse all').disabled).toBe(true);
      });

      it('are both disabled on a diagram of a single node, and say why', async () => {
        bench.reset('blank');
        await settle();
        await bench.addNode();
        await settle();
        expect(bench.stats()).toMatchObject({ nodes: 1, links: 0 });
        expect(bothDisabled()).toBe(true);
        expect(tool('Expand all').dataset['tip']).toBe('Expand all: there are no relationships');
        expect(tool('Collapse all').dataset['tip']).toBe(
          'Collapse all: there are no relationships',
        );
      });

      it('are both disabled while none of several nodes is joined to another', async () => {
        bench.reset('blank');
        await settle();
        await bench.addNode();
        await bench.addNode();
        await bench.addNode();
        await settle();
        expect(bench.stats()).toMatchObject({ nodes: 3, links: 0 });
        expect(bothDisabled()).toBe(true);
      });

      it('stay disabled when the only relationships are hand-drawn, which have no card', async () => {
        bench.reset('blank');
        await settle();
        await bench.addNode();
        await bench.addNode();
        const [first, second] = [diagram.findNodeForKey(1)!, diagram.findNodeForKey(2)!];
        diagram.startTransaction('Linking');
        diagram.toolManager.linkingTool.insertLink(first, first.port, second, second.port);
        diagram.commitTransaction('Linking');
        await settle();
        expect(bench.stats()).toMatchObject({ nodes: 2, links: 1 });
        expect(bothDisabled()).toBe(true);
      });

      it('are disabled once the last relationship is removed, also while the cards were shown', async () => {
        bench.reset('fund-structure');
        await settle();
        await bench.expandCards();
        await settle();
        expect(tool('Collapse all').disabled).toBe(false);

        diagram.selectCollection(diagram.links);
        await bench.deleteSelection();
        await settle();
        expect(bench.stats()?.links).toBe(0);
        expect(bothDisabled()).toBe(true);

        // Undo brings the relationships back, and the tools with them.
        await bench.undo();
        await settle();
        expect(tool('Collapse all').disabled).toBe(false);
      });
    });

    describe('expand all and collapse all', () => {
      const cards = () => {
        const found: go.Adornment[] = [];
        diagram.links.each((link) => {
          const card = link.findAdornment('Card');
          if (card) found.push(card);
        });
        return found;
      };
      const positions = () => model().nodeDataArray.map((node) => node.loc);
      const press = async (label: 'Expand all' | 'Collapse all') => {
        await (label === 'Expand all' ? bench.expandCards() : bench.collapseCards());
        await settle();
        // The cards are placed once all lines are routed; one more round draws them there.
        await settle();
      };

      it('are started from their buttons', async () => {
        tool('Expand all').click();
        await settle();
        // The click queues the operation; an empty undo and redo behind it tell when it is done.
        await bench.undoAll();
        await bench.redoAll();
        await settle();
        expect(cards()).toHaveLength(model().linkDataArray.length);

        tool('Collapse all').click();
        await settle();
        await bench.undo();
        await bench.redo();
        await settle();
        expect(cards()).toHaveLength(0);
      });

      it('show the card of every relationship, and hide them all again', async () => {
        expect(cards()).toHaveLength(0);
        expect(tool('Expand all').disabled).toBe(false);
        expect(tool('Collapse all').disabled).toBe(true);

        await press('Expand all');
        expect(cards()).toHaveLength(model().linkDataArray.length);
        expect(model().modelData.cardsExpanded).toBe(true);
        expect(tool('Expand all').disabled).toBe(true);
        expect(tool('Collapse all').disabled).toBe(false);

        await press('Collapse all');
        expect(cards()).toHaveLength(0);
        expect(model().modelData.cardsExpanded).toBe(false);
        expect(tool('Expand all').disabled).toBe(false);
        expect(tool('Collapse all').disabled).toBe(true);
      });

      it('move the nodes apart so that every card stands between them, on none of them', async () => {
        const compact = diagram.documentBounds.copy();
        await press('Expand all');
        expect(diagram.documentBounds.width).toBeGreaterThan(compact.width * 1.5);

        const nodes: go.Rect[] = [];
        diagram.nodes.each((node) => nodes.push(node.actualBounds));
        const shown = cards().map((card) => card.actualBounds);
        for (const card of shown) {
          expect(nodes.some((node) => node.intersectsRect(card))).toBe(false);
        }
        for (let i = 0; i < shown.length; i++) {
          for (let j = i + 1; j < shown.length; j++) {
            expect(shown[i].intersectsRect(shown[j])).toBe(false);
          }
        }
      });

      it('are one undo step each: undo brings back the old places and puts the cards away', async () => {
        const before = positions();
        await press('Expand all');
        expect(bench.stats()).toMatchObject({ historyLength: 1 });
        expect(bench.log().at(-1)!.op).toBe('Expand all');
        expect(positions()).not.toEqual(before);

        await bench.undo();
        await settle();
        expect(positions()).toEqual(before);
        expect(cards()).toHaveLength(0);
        expect(tool('Expand all').disabled).toBe(false);
        expect(bench.stateCheck()).toEqual({ label: INITIAL, ok: true });

        await bench.redo();
        await settle();
        expect(cards()).toHaveLength(model().linkDataArray.length);
        expect(tool('Collapse all').disabled).toBe(false);
      });

      it('put the nodes close together again on collapse', async () => {
        const compact = diagram.documentBounds.copy();
        await press('Expand all');
        await press('Collapse all');
        // The same compact arrangement, give or take a label at the edge.
        expect(Math.abs(diagram.documentBounds.width - compact.width)).toBeLessThan(40);
        expect(Math.abs(diagram.documentBounds.height - compact.height)).toBeLessThan(40);
      });

      it('keep the room and the cards when the layout is switched or arranged again', async () => {
        await press('Expand all');
        await bench.changeLayout('grid');
        await bench.autoArrange();
        await settle();
        // The cards are placed once all lines are routed; one more round draws them there.
        await settle();
        expect(cards()).toHaveLength(model().linkDataArray.length);
        const nodes: go.Rect[] = [];
        diagram.nodes.each((node) => nodes.push(node.actualBounds));
        for (const card of cards()) {
          expect(nodes.some((node) => node.intersectsRect(card.actualBounds))).toBe(false);
        }
      });

      it('work after the line type was changed, a node was styled and that was undone', async () => {
        bench.reset('200');
        await settle();
        await bench.changeLinkType('orthogonal');
        await select(5);
        await bench.editSelected('color', '#fecaca');
        await bench.undo();
        await settle();

        await press('Expand all');
        expect(page.querySelector('.failure')).toBeNull();
        expect(cards()).toHaveLength(model().linkDataArray.length);
        expect(tool('Collapse all').disabled).toBe(false);
        expect(bench.log()[0].op).toBe('Expand all');
      }, 30_000);

      it('take the cards away again when an Expand all fails halfway', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const layoutDiagram = vi
          .spyOn(diagram, 'commit')
          .mockImplementationOnce((work: (d: go.Diagram) => void) => {
            diagram.startTransaction('expand all');
            work(diagram);
            for (let i = 0; i < 3; i++) diagram.maybeUpdate();
            throw new Error('boom');
          });
        await bench.expandCards();
        await settle();
        layoutDiagram.mockRestore();
        vi.restoreAllMocks();

        expect(page.querySelector('.failure')).not.toBeNull();
        expect(model().modelData.cardsExpanded).toBe(false);
        expect(cards()).toHaveLength(0);
        expect(tool('Expand all').disabled).toBe(false);
      });

      it('put away the card that a click on an info icon opened', async () => {
        showLinkInfo(model().linkDataArray[0]);
        await settle();
        expect(page.querySelector('.link-card')).not.toBeNull();
        await press('Expand all');
        expect(page.querySelector('.link-card')).toBeNull();
      });

      it('start collapsed again when other data is loaded', async () => {
        await press('Expand all');
        bench.reset('fund-structure');
        await settle();
        expect(cards()).toHaveLength(0);
        expect(model().modelData.cardsExpanded).toBe(false);
        expect(tool('Expand all').disabled).toBe(false);
        expect(tool('Collapse all').disabled).toBe(true);
      });

      it('are disabled on an empty diagram', async () => {
        bench.reset('blank');
        await settle();
        expect(tool('Expand all').disabled).toBe(true);
        expect(tool('Collapse all').disabled).toBe(true);
      });
    });

    describe('shape', () => {
      const choices = () =>
        Array.from(page.querySelectorAll<HTMLButtonElement>('.nav-flyout button'));
      const pickShape = async (label: string) => {
        tool('Shape').click();
        await settle();
        choices()
          .find((choice) => choice.dataset['tip'] === label)!
          .click();
        await settle();
        await bench.undoAll();
        await bench.redoAll();
      };
      /** The keys of the nodes that carry the gold outline of a highlighted tree. */
      const highlightedKeys = () => {
        const keys: number[] = [];
        diagram.nodes.each((node) => {
          if (node.findAdornment('Focus')) keys.push(node.key as number);
        });
        return keys.sort((a, b) => a - b);
      };

      it('needs a selection', async () => {
        expect(tool('Shape').disabled).toBe(true);
        expect(tool('Shape').dataset['tip']).toBe('Shape: select nodes first');
        await select(3, 5);
        expect(tool('Shape').disabled).toBe(false);
        expect(tool('Shape').dataset['tip']).toBe('Shape: Square');
      });

      it('opens a column of shape pictures that are named on hover', async () => {
        await select(3, 5);
        tool('Shape').click();
        await settle();
        expect(page.querySelector('.nav-flyout')!.getAttribute('aria-label')).toBe('Shapes');
        expect(choices().map((choice) => choice.dataset['tip'])).toEqual([
          'Square',
          'Rounded',
          'Ellipse',
          'Diamond',
          'Capsule',
          'Rounded top',
        ]);
        for (const choice of choices()) {
          expect(choice.getAttribute('aria-label')).toBe(choice.dataset['tip']);
          expect(choice.querySelector('svg path')!.getAttribute('d')).toBeTruthy();
        }
        const current = choices().filter((choice) => choice.classList.contains('current'));
        expect(current.map((choice) => choice.dataset['tip'])).toEqual(['Square']);
      });

      it('gives every selected node the picked shape, as one undo step, and closes', async () => {
        await select(3, 5, 8);
        await pickShape('Diamond');

        for (const key of [3, 5, 8]) expect(nodeData(key).shape).toBe('Diamond');
        expect(nodeData(4).shape).toBe(DEFAULT_SHAPE);
        expect(bench.stats()).toMatchObject({ historyLength: 1 });
        expect(bench.log().at(-1)!.op).toBe('Set shape on 3 nodes');
        expect(page.querySelector('.nav-flyout')).toBeNull();
        expect(tool('Shape').dataset['tip']).toBe('Shape: Diamond');
      });

      it('says "mixed" when the selected nodes differ, and shows its picture when they agree', async () => {
        await select(3, 4);
        await bench.editSelected('shape', 'Ellipse');
        await select(3, 5);
        expect(tool('Shape').dataset['tip']).toBe('Shape: mixed');
        expect(tool('Shape').querySelector('svg.shape-icon')).toBeNull();
        await select(3, 4);
        expect(tool('Shape').dataset['tip']).toBe('Shape: Ellipse');
        expect(tool('Shape').querySelector('svg.shape-icon')).not.toBeNull();
      });

      it('works on all highlighted nodes when one node is selected and its tree is highlighted', async () => {
        await select(2);
        const tree = highlightedKeys();
        expect(tree.length).toBeGreaterThan(1);
        expect(tree).toContain(2);
        expect(tool('Shape').dataset['tip']).toBe(
          `Shape of the ${tree.length} highlighted nodes: Square`,
        );

        await pickShape('Capsule');
        for (const node of model().nodeDataArray) {
          expect(node.shape).toBe(tree.includes(node.key) ? 'Capsule' : DEFAULT_SHAPE);
        }
        expect(bench.stats()).toMatchObject({ historyLength: 1 });
        expect(bench.log().at(-1)!.op).toBe(`Set shape on ${tree.length} nodes`);

        await bench.undo();
        for (const node of model().nodeDataArray) expect(node.shape).toBe(DEFAULT_SHAPE);
      });

      it('includes the nodes joined to the selected one by a relationship the user drew', async () => {
        const outsider = model().nodeDataArray.find((node) => {
          diagram.select(diagram.findNodeForKey(2)!);
          return !highlightedKeys().includes(node.key);
        })!;
        diagram.clearSelection();
        diagram.commit(
          () => model().addLinkData({ key: 950, from: 2, to: outsider.key, category: 'manual' }),
          'draw',
        );
        await settle();
        await select(2);
        expect(highlightedKeys()).toContain(outsider.key);
        await pickShape('Diamond');
        expect(outsider.shape).toBe('Diamond');
      });

      it('goes back to the selected node alone once the highlight has ended', async () => {
        await select(2);
        expect(tool('Shape').dataset['tip']).toContain('highlighted nodes');
        // Zoom to fit ends the highlight; the node stays selected.
        bench.zoomToFit();
        await settle();
        expect(tool('Shape').dataset['tip']).toBe('Shape: Square');
        await pickShape('Ellipse');
        expect(nodeData(2).shape).toBe('Ellipse');
        expect(model().nodeDataArray.filter((node) => node.shape === 'Ellipse')).toHaveLength(1);
      });

      it('closes its column when the selection is cleared', async () => {
        await select(3);
        tool('Shape').click();
        await settle();
        diagram.clearSelection();
        await settle();
        expect(page.querySelector('.nav-flyout')).toBeNull();
      });

      it('has left the side panel, which keeps title, legal entity type and color', async () => {
        await select(3);
        const labels = Array.from(page.querySelectorAll('.side label')).map((label) =>
          label.textContent!.trim(),
        );
        expect(labels).toContain('Title');
        expect(labels).toContain('Legal entity type');
        expect(labels).not.toContain('Shape');
        expect(page.querySelector('.side select')).toBeNull();
      });
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
      expect(choices.map((choice) => choice.dataset['tip'])).toEqual([
        'Top to bottom',
        'Bottom to top',
        'Circle',
        'Layered digraph',
        'Force-directed',
        'Grid',
      ]);
      expect(choices.find((choice) => choice.classList.contains('current'))?.dataset['tip']).toBe(
        'Top to bottom',
      );

      choices.find((choice) => choice.dataset['tip'] === 'Circle')!.click();
      await settle();
      await bench.undoAll();
      await bench.redoAll();
      expect(bench.layoutType()).toBe('circle');
      expect(page.querySelector('.nav-flyout')).toBeNull();
      expect(tool('Layout').dataset['tip']).toBe('Layout: Circle');
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
      expect(choices.map((choice) => choice.dataset['tip'])).toEqual([
        'Orthogonal, rounded',
        'Orthogonal, square',
        'Straight (crosses nodes)',
        'Curved (crosses nodes)',
      ]);

      choices.find((choice) => choice.dataset['tip']!.startsWith('Straight'))!.click();
      await settle();
      await bench.undoAll();
      await bench.redoAll();
      expect(bench.linkType()).toBe('straight');
      expect(page.querySelector('.nav-flyout')).toBeNull();
      expect(tool('Lines').dataset['tip']).toBe('Lines: Straight (crosses nodes)');
    });

    it('shows only one column of icons at a time', async () => {
      tool('Layout').click();
      await settle();
      tool('Lines').click();
      await settle();
      expect(page.querySelectorAll('.nav-flyout')).toHaveLength(1);
      expect(page.querySelector('.nav-flyout')!.getAttribute('aria-label')).toBe('Line types');

      await select(3);
      tool('Shape').click();
      await settle();
      expect(page.querySelectorAll('.nav-flyout')).toHaveLength(1);
      expect(page.querySelector('.nav-flyout')!.getAttribute('aria-label')).toBe('Shapes');
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
    it('ends, at the right, with Styles, Actions, reset, new diagram and the developer tools switch', async () => {
      const controls = Array.from(page.querySelectorAll<HTMLElement>('header .bar-end > *')).map(
        (control) => control.getAttribute('aria-label') ?? control.textContent?.trim(),
      );
      expect(controls).toEqual([
        'Styles',
        'Actions',
        'Reset diagram',
        'New diagram',
        'Developer tools',
      ]);

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

    it('follow the data that is loaded', async () => {
      bench.reset('fund-structure');
      await settle();
      expect(field('Diagram name').value).toBe('Sample fund structure');
      expect(field('Diagram name').classList.contains('missing')).toBe(false);
    });

    it('leave the name of a new diagram to the user: the box is empty and marked as required', async () => {
      const name = () => field('Diagram name');
      expect(name().required).toBe(true);
      expect(name().getAttribute('aria-invalid')).toBe('false');

      page.querySelector<HTMLButtonElement>('header button[aria-label="New diagram"]')!.click();
      await settle();
      expect(name().value).toBe('');
      expect(name().placeholder).toBe('Diagram name (required)');
      expect(name().classList.contains('missing')).toBe(true);
      expect(name().getAttribute('aria-invalid')).toBe('true');
      expect(model().modelData.name).toBe('');

      await type('Diagram name', 'Meridian holdings');
      expect(name().classList.contains('missing')).toBe(false);
      expect(name().getAttribute('aria-invalid')).toBe('false');

      // Taking the name away again is an undo step like any other, and the box asks for one again.
      await bench.undo();
      await settle();
      expect(name().value).toBe('');
      expect(name().classList.contains('missing')).toBe(true);
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
    /** How many lines run across a node that is not one of their own ends. */
    const linesOverNodes = (): number => {
      const bounds: go.Rect[] = [];
      diagram.nodes.each((node) => bounds.push(node.actualBounds));
      let count = 0;
      diagram.links.each((link) => {
        const own = [link.fromNode!.actualBounds, link.toNode!.actualBounds];
        for (let i = 1; i < link.pointsCount; i++) {
          const [a, b] = [link.getPoint(i - 1), link.getPoint(i)];
          const crossed = bounds.some(
            (node) =>
              !own.includes(node) &&
              go.Rect.intersectsLineSegment(
                node.x + 1,
                node.y + 1,
                node.width - 2,
                node.height - 2,
                a.x,
                a.y,
                b.x,
                b.y,
              ),
          );
          if (crossed) {
            count++;
            return;
          }
        }
      });
      return count;
    };

    it('keep the line type they are opened with, and their lines go around the nodes', async () => {
      expect(bench.linkType()).toBe('avoid');
      bench.reset('500');
      await settle();
      expect(bench.stats()?.nodes).toBe(500);
      expect(bench.linkType()).toBe('avoid');
      expect(model().modelData.linkType).toBe('avoid');
      expect(linesOverNodes()).toBe(0);
    }, 20_000);

    it('switch between line types as one undo step each, around the nodes again on the way back', async () => {
      bench.reset('500');
      await settle();
      await bench.changeLinkType('straight');
      await settle();
      expect(bench.stats()).toMatchObject({ historyLength: 1 });
      expect(linesOverNodes()).toBeGreaterThan(0);

      await bench.changeLinkType('orthogonal');
      await settle();
      expect(linesOverNodes()).toBe(0);

      await bench.undo();
      await bench.undo();
      await settle();
      expect(bench.linkType()).toBe('avoid');
      expect(linesOverNodes()).toBe(0);
      expect(bench.stateCheck()).toEqual({ label: INITIAL, ok: true });
    }, 20_000);

    it('are not opened in a layout that is slow there, even if a smaller diagram used it', async () => {
      await bench.changeLayout('circle');
      bench.reset('100');
      await settle();
      // A hundred funds in a circle are no trouble.
      expect(bench.layoutType()).toBe('circle');

      bench.reset('500');
      await settle();
      expect(bench.layoutType()).toBe('top-bottom');
      expect(model().modelData.layoutType).toBe('top-bottom');
      expect(linesOverNodes()).toBe(0);
    }, 30_000);

    it('keep a quick layout that was chosen before', async () => {
      await bench.changeLayout('grid');
      bench.reset('500');
      await settle();
      expect(bench.layoutType()).toBe('grid');
    }, 30_000);

    it('name the line types the same as on a small diagram', async () => {
      const titles = async () => {
        page.querySelector<HTMLButtonElement>('button[aria-label="Lines"]')!.click();
        await settle();
        const found = Array.from(
          page.querySelectorAll<HTMLButtonElement>('.nav-flyout button'),
        ).map((choice) => choice.dataset['tip']);
        page.querySelector<HTMLButtonElement>('button[aria-label="Lines"]')!.click();
        await settle();
        return found;
      };
      const names = [
        'Orthogonal, rounded',
        'Orthogonal, square',
        'Straight (crosses nodes)',
        'Curved (crosses nodes)',
      ];
      expect(await titles()).toEqual(names);

      bench.reset('500');
      await settle();
      expect(await titles()).toEqual(names);
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

  describe('a diagram without nodes', () => {
    const stylesButton = () =>
      Array.from(page.querySelectorAll<HTMLButtonElement>('header button')).find((button) =>
        button.textContent!.includes('Styles'),
      )!;
    const actionsMenu = () =>
      page.querySelector<HTMLSelectElement>('select[aria-label="Actions"]')!;
    const startEmpty = async () => {
      bench.reset('blank');
      await settle();
    };

    it('has nothing to style: the Styles button is disabled and says why', async () => {
      expect(stylesButton().disabled).toBe(false);
      expect(stylesButton().title).toBe('Set color and shape per legal entity field');

      await startEmpty();
      expect(stylesButton().disabled).toBe(true);
      expect(stylesButton().title).toBe('Styles: add a node first');
    });

    it('has nothing to export or print: the Actions dropdown is disabled', async () => {
      expect(actionsMenu().disabled).toBe(false);

      await startEmpty();
      expect(actionsMenu().disabled).toBe(true);
    });

    it('has nothing to search: the search box is disabled and says why', async () => {
      const search = () => page.querySelector<HTMLInputElement>('.search input')!;
      expect(search().disabled).toBe(false);
      expect(search().placeholder).toBe('Search nodes');

      await startEmpty();
      expect(search().disabled).toBe(true);
      expect(search().placeholder).toBe('No nodes to search');
      // Name and description can be given before the first node.
      expect(page.querySelector<HTMLInputElement>('.diagram-name')!.disabled).toBe(false);

      await bench.addNode();
      await settle();
      expect(search().disabled).toBe(false);
      expect(search().placeholder).toBe('Search nodes');
    });

    it('still offers Reset and New diagram', async () => {
      await startEmpty();
      for (const label of ['Reset diagram', 'New diagram']) {
        const button = page.querySelector<HTMLButtonElement>(
          `header button[aria-label="${label}"]`,
        )!;
        expect(button.disabled).toBe(false);
      }
    });

    it('offers both again once it has a node, and not after that node is undone', async () => {
      await startEmpty();
      await bench.addNode();
      await settle();
      expect(stylesButton().disabled).toBe(false);
      expect(actionsMenu().disabled).toBe(false);

      await bench.undo();
      await settle();
      expect(stylesButton().disabled).toBe(true);
      expect(actionsMenu().disabled).toBe(true);
    });

    it('loses them when its last node is deleted', async () => {
      await startEmpty();
      await bench.addNode();
      await settle();
      bench.askToDelete([nodeData(1)]);
      await bench.confirmDelete();
      await settle();
      expect(bench.stats()?.nodes).toBe(0);
      expect(stylesButton().disabled).toBe(true);
      expect(actionsMenu().disabled).toBe(true);
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
      expect(data.map((row) => row[3])).toEqual(['title', 'legal entity type', 'shape', 'color']);
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
      // The four fields of every node, the layout, and the place the layout gave every node.
      const data = groups.filter((group) => group.startsWith('Data '));
      for (const field of ['color', 'legal entity type', 'shape', 'title']) {
        expect(data).toContain(`Data ${field} × 30`);
      }
      expect(data).toContain('Data layout × 1');
      expect(data.some((group) => /^Data position × (2[89]|30)$/.test(group))).toBe(true);
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
      vi.spyOn(diagram, 'commit').mockImplementationOnce(() => {
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

    it('does not interrupt a drag or a text edit because of an error elsewhere on the page', async () => {
      diagram.currentTool = diagram.toolManager.textEditingTool;
      model().startTransaction('tool at work');
      window.dispatchEvent(new ErrorEvent('error', { message: 'ResizeObserver loop' }));
      await settle();
      expect(level()).toBe(1);
      expect(diagram.currentTool).toBe(diagram.toolManager.textEditingTool);
      expect(notice()).toBeNull();
      model().commitTransaction('tool at work');
      diagram.currentTool = diagram.defaultTool;
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

  describe('developer tools', () => {
    /** The page as someone sees it who never asked for the developer tools. */
    let plain: ComponentFixture<DiagramPage>;
    let plainPage: HTMLElement;
    let plainBench: Bench;

    const toolsSwitch = () =>
      plainPage.querySelector<HTMLButtonElement>('header button[aria-label="Developer tools"]')!;
    const headings = () =>
      Array.from(plainPage.querySelectorAll('.side h2')).map((heading) => heading.textContent);
    const calm = async () => {
      const plainDiagram = plainBench.diagram;
      for (let i = 0; i < 3; i++) plainDiagram.maybeUpdate();
      await plain.whenStable();
    };

    beforeEach(async () => {
      localStorage.clear();
      plain = TestBed.createComponent(DiagramPage);
      plain.detectChanges();
      await plain.whenStable();
      plainPage = plain.nativeElement as HTMLElement;
      plainBench = benchOf(plain);
      plainBench.diagram.viewSize = new go.Size(1000, 700);
      await calm();
    });

    afterEach(() => plain.destroy());

    it('are hidden at first: the page shows the editor only', () => {
      expect(toolsSwitch().getAttribute('aria-pressed')).toBe('false');
      expect(toolsSwitch().title).toBe(
        'Developer tools: timings, history numbers and random edits',
      );
      expect(plainPage.querySelector('.log')).toBeNull();
      expect(headings()).toEqual(['Selected relationships', 'Selected nodes']);
      expect(plainPage.textContent).not.toContain('Randomize');
      expect(plainPage.textContent).not.toContain('Benchmark statistics');
    });

    it('leave the whole editor in place while hidden', () => {
      expect(plainPage.querySelector('nav.canvas-nav')).not.toBeNull();
      expect(plainPage.querySelector('.canvas-bar')).not.toBeNull();
      expect(plainPage.querySelector('.overview')).not.toBeNull();
      expect(plainPage.querySelector('button[aria-label="Undo"]')).not.toBeNull();
    });

    it('come with the switch in the top bar, and go with it again', async () => {
      toolsSwitch().click();
      await calm();
      expect(toolsSwitch().getAttribute('aria-pressed')).toBe('true');
      expect(toolsSwitch().title).toBe('Hide the developer tools');
      expect(plainPage.querySelector('.log table')).not.toBeNull();
      expect(headings()).toEqual(['History', 'Edits', 'Selected relationships', 'Selected nodes']);

      toolsSwitch().click();
      await calm();
      expect(toolsSwitch().getAttribute('aria-pressed')).toBe('false');
      expect(plainPage.querySelector('.log')).toBeNull();
      expect(headings()).toEqual(['Selected relationships', 'Selected nodes']);
    });

    it('list what was done while they were hidden', async () => {
      await plainBench.addNode();
      await plainBench.undo();
      await calm();
      expect(plainPage.querySelector('.log')).toBeNull();

      toolsSwitch().click();
      await calm();
      const operations = Array.from(plainPage.querySelectorAll('.log tbody tr')).map(
        (row) => row.querySelector('td')!.textContent,
      );
      expect(operations).toEqual(['Undo', 'Add node']);
      expect(plainPage.querySelector('.state')!.textContent).toContain('Initial state');
    });

    it('tell the diagram that the canvas has a new height', async () => {
      const frames: FrameRequestCallback[] = [];
      const frame = vi
        .spyOn(window, 'requestAnimationFrame')
        .mockImplementation((callback) => frames.push(callback));
      const update = vi.spyOn(plainBench.diagram, 'requestUpdate');

      toolsSwitch().click();
      await plain.whenStable();
      frames.forEach((callback) => callback(0));
      expect(update).toHaveBeenCalled();
      frame.mockRestore();
    });

    it('are remembered for the next visit', async () => {
      toolsSwitch().click();
      await calm();
      const again = TestBed.createComponent(DiagramPage);
      again.detectChanges();
      await again.whenStable();
      const againPage = again.nativeElement as HTMLElement;
      expect(againPage.querySelector('.log table')).not.toBeNull();
      expect(againPage.querySelector('.side h2')!.textContent).toBe('History');
      again.destroy();
    });

    it('cannot be switched while a diagram is loading', () => {
      plainBench.reset('100');
      plain.detectChanges();
      expect(plainBench.busy()).toBe(true);
      expect(toolsSwitch().disabled).toBe(true);
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
      const again = TestBed.createComponent(DiagramPage);
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
